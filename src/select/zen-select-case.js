/**
 * This Angular directive is created by Curt Kirkhoff, under the MIT (open source) License.
 * curt@kirkhoff.com
 */

angular.module('zen.ui.select', [])
    .factory('$dom', function($q, $timeout){
        /**
         * Traverses the DOM descendants of a container element in search of a given target element.
         * @param t - jqLite/jQuery/DOM Object, target element
         * @param c - jqLite/jQuery/DOM Object, container element
         * @returns {Boolean}
         */
        function targetExistsIn(t, c){
            var children = angular.element(c).children();
            if (children.length > 0){
                for (var i = 0; i < children.length; i++) {
                    var child = children[i];
                    if (t === child) return true;
                    else if (targetExistsIn(t, child) === true) return true;
                }
            }
            return false;
        }

        /**
         * Returns a promise for the outer width of a given target element.
         * @param target - jqLite/jQuery/DOM Object, target element
         * @param extraPaddingFn - function for retrieving extra padding (must return an Integer)
         * @returns Angular promise
         */
        function targetWidth(target, extraPaddingFn){
            var deferred = $q.defer(),
                element = angular.element(target),
                elementDisplay = element.css('display') || 'inline',
                elementVisibility = element.css('visibility') || 'visible',
                attempt = 1,
                delay = 10,
                timeout = null,
                borderWidth = parseInt(element.css('border-left-width'), 10) + parseInt(element.css('border-right-width'), 10),
                elementPadding = parseInt(element.css('padding-left'), 10) + parseInt(element.css('padding-right'), 10),
                padding = borderWidth,
                width = 0,
                MAX_ATTEMPTS = 10;

            element.css({
                'display': 'block',
                'visibility': 'hidden'
            });

            width = getWidth();

            /**
             * Gets the calculated width of our target element, or at least tries.
             * @returns {Number}
             */
            function getWidth(){
                return element[0].offsetWidth;
            }

            /**
             * Tries to retrieve the calculated width of our target element and returns it in a promise if successful.
             * If not, the promise is deferred for a certain number of attempts and a delay that exponentially
             * increases upon each attempt.
             */
            function delayPromise(){
                padding = borderWidth + elementPadding + parseInt(extraPaddingFn(), 10);
                width = getWidth();
                if (width && width - padding > 0) {
                    element.css({
                        'display': elementDisplay,
                        'visibility': elementVisibility
                    });
                    deferred.resolve(width + padding);
                }
                else if (attempt <= MAX_ATTEMPTS) {
                    attempt++;
                    delay *= 2;
                    timeout = $timeout(delayPromise, delay);
                } else deferred.reject('Unable to get contentWidth of element, [' + target + ']');
            }
            if (width - padding <= 0) delayPromise();
            return deferred.promise;
        }
        return {
            targetExistsIn: targetExistsIn,
            targetWidth: targetWidth
        }
    })
    .directive('zenSelect', function($http, $templateCache, $compile, $document, $timeout, $dom){
        var counter = -1;
        return {
            restrict: 'EA',
            replace: false,
            scope: {
                ngModel: '=',
                ngDisabled: '='
            },
            compile: function(tElement, tAttrs){
                var templateUrl = tAttrs.templateUrl || '/template/select/select.html',
                    templateLoader = $http.get(templateUrl, {cache: $templateCache}),
                    selectId = tAttrs['id'],
                    zenSelect,
                    toggle,
                    list,
                    listContainer,
                    selectedOption,
                    focusIndex,
                    queryPromise,
                    query = '',
                    lastQueryIndex = 0,
                    widthSetFlag = false;

                // Upon each creation of a styled select box, increase the counter integer.
                counter++;

                return function(scope, element){
                    templateLoader.then(function(){
                        templateLoader
                            .success(function(templateHtml){
                                zenSelect = element.after(templateHtml).next();
                                element.css('display', 'none');
                            })
                            .then(function(){
                                zenSelect.replaceWith($compile(zenSelect)(scope));
                                toggle = zenSelect.find('button').eq(0);
                                listContainer = toggle.next();
                                list = zenSelect.find('ul').eq(0);

                                // Allows us to create unique ids for multiple styled select boxes on the same page.
                                scope['selectId'] = selectId || counter;

                                // If the original select is disabled, disable the styled version as well.
                                scope.$watch('ngDisabled', function(newValue){
                                    scope.selectDisabled = (angular.isDefined(newValue) && newValue);
                                });

                                // Updates the options array and sets the selected label when the select model changes.
                                scope.$watch('ngModel', function(){
                                    scope.options = getOptionsFromDom();
                                    scope.selectedLabel = scope.options[element[0].selectedIndex].label;

                                    if (!widthSetFlag && !listContainer.css('width')) {
                                        // Set the size of the toggle button equal to the widest option
                                        $dom.targetWidth(listContainer[0], function(){
                                            var option = listContainer.find('li').eq(0);
                                            return parseInt(option.css('padding-left'), 10) + parseInt(option.css('padding-right'), 10);
                                        }).then(function(w){
                                                // After we get our width back, add the padding back in
                                                w = w + parseInt(toggle.css('padding-left'), 10)
                                                    + parseInt(toggle.css('padding-right'), 10);
                                                listContainer.attr('style', '').css('width', w);
                                                toggle.css('width', w);
                                            });
                                        widthSetFlag = true;
                                    }
                                });

                                // Sets option from an object within the scope.options array.
                                scope.selectOption = function(e, option){
                                    // 32 = space bar, 13 = enter key
                                    if (e.keyCode === 32 || e.keyCode === 13 || e.type === 'click')
                                        setSelectedOption(option, closeDropdownAndFocusToggle);
                                };

                                // Event handler for keydown on styled select options.
                                scope.optionKeyDown = function(e){
                                    // 32 = space bar, 13 = enter key
                                    if (e.keyCode === 32 || e.keyCode === 13) e.preventDefault();
                                };

                                // Event handlers for our styled select box
                                toggle.on('click', toggleDropdown);
                                toggle.on('keyup', selectKeyUp);
                                zenSelect.on('keydown', selectKeyDown);
                                $document.on('click', function(e){
                                    if (!$dom.targetExistsIn(e.target, zenSelect)) closeDropdown();
                                });

                                /**
                                 * Closes the styled select box.
                                 * @param callback - optional callback function
                                 */
                                function closeDropdown(callback){
                                    listContainer.addClass('zen-ui-select-hidden');
                                    zenSelect.removeClass('zen-ui-select-open');
                                    if (callback && typeof(callback) === 'function') callback();
                                }

                                /**
                                 * Closes the styled select box and immediately sets focus to the toggle button.
                                 */
                                function closeDropdownAndFocusToggle(){
                                    closeDropdown(function(){
                                        toggle.focus();
                                    });
                                }

                                /**
                                 * Finds the option-equivalent under the styled select box, using an index integer.
                                 * @param i - index integer
                                 * @returns jqLite/jQuery Object
                                 */
                                function getOptionElementFromIndex(i){
                                    return list.children().eq(i);
                                }

                                /**
                                 * Finds the index integer from the option-equivalent under the styled select box.
                                 * @param option - HTML element (from the styled select)
                                 * @returns {Integer}
                                 */
                                function getOptionIndexFromElement(option){
                                    return option.data('index');
                                }

                                /**
                                 * References the DOM to find option elements from within the select element
                                 * we're working with and then pulls out the info we need to create an array of
                                 * option objects containing the following for each: label, value, and selected.
                                 * @returns {Array}
                                 */
                                function getOptionsFromDom(){
                                    var optionElements = element.find('option'),
                                        out = [];

                                    // Copy original select options into zen-select
                                    angular.forEach(optionElements, function(o){
                                        var option = {
                                            'label': o.label || angular.element(o).text(),
                                            'value': o.value,
                                            'selected': o.selected
                                        };
                                        this.push(option);
                                    }, out);
                                    return out;
                                }

                                /**
                                 * Traverses children of our styled list element in the DOM to find which one is
                                 * currently selected. This depends on the class, 'selected' to be present on an option.
                                 * @returns jqLight/jQuery Object
                                 */
                                function getSelectedOptionElement(){
                                    for (var i = 0; i < list.children().length; i++) {
                                        var o = list.children().eq(i);
                                        if (o.hasClass('selected')) return o;
                                    }
                                    return list.children().eq(0);
                                }

                                /**
                                 * Returns a boolean to determine whether or not the styled select box is open.
                                 * @returns {Boolean}
                                 */
                                function isOpen(){
                                    return zenSelect.hasClass('zen-ui-select-open');
                                }

                                /**
                                 * Opens the styled select box.
                                 */
                                function openDropdown(){
                                    listContainer.removeClass('zen-ui-select-hidden');
                                    zenSelect.addClass('zen-ui-select-open');
                                    setInitialFocus();
                                }

                                /**
                                 * Searches available options within our styled select using a query string, and then
                                 * selects the first result it finds. This query is circular, in that a new search
                                 * will pick up from the previously selected index and look forward before looping back
                                 * around from index 0. Example: starting at index 5 of 6, the order of searched items
                                 * follows: 6, 0, 1, 2, 3, 4.
                                 * @param queryStr - the search string we are comparing against our options
                                 */
                                function searchOptions(queryStr){
                                    var i = 0,
                                        option,
                                        numOptions = scope.options.length,
                                        startIndex = (lastQueryIndex >= numOptions - 1) ? 0 : lastQueryIndex + 1;

                                    searchFromTo(startIndex, numOptions);

                                    function searchFromTo(start, end) {
                                        for (i = start; i < end; i++) {
                                            option = scope.options[i];
                                            if (option.label.toLowerCase().substring(0, queryStr.length) === queryStr) {
                                                lastQueryIndex = i;
                                                scope.$apply(function(){
                                                    setSelectedOption(option, function(){ getOptionElementFromIndex(i).focus() });
                                                });
                                                return;
                                            }
                                        }
                                        if (start > 0) searchFromTo(0, lastQueryIndex);
                                    }
                                }

                                /**
                                 * This is the keydown event on the styled select toggle button.
                                 * @param e - event object, used to capture the keyCode in our cases
                                 */
                                function selectKeyDown(e){
                                    // 40 = down arrow
                                    if (e.keyCode === 40) {
                                        if (isOpen()) setNextFocus(e.target);
                                        else openDropdown();
                                        e.preventDefault();
                                    }
                                    // 38 = up arrow
                                    else if (e.keyCode === 38) {
                                        if (isOpen()) setPrevFocus(e.target);
                                        else openDropdown();
                                        e.preventDefault();
                                    }
                                    // 27 = escape
                                    else if (e.keyCode === 27) {
                                        closeDropdownAndFocusToggle();
                                        e.preventDefault();
                                    }
                                    // 9 = tab
                                    else if (e.keyCode === 9) {
                                        if (isOpen()) e.preventDefault();
                                    }
                                    // 48-90 = alpha-numeric
                                    else if (e.keyCode >= 48 && e.keyCode <= 90) {
                                        var character = String.fromCharCode(e.keyCode).toLowerCase();
                                        $timeout.cancel(queryPromise);
                                        queryPromise = $timeout(function(){ query = '' }, 777);
                                        query = (query.length === 1 && query === character) ? character : query + character;
                                        searchOptions(query);
                                    }
                                    // 13 = enter key
                                    else if (e.keyCode === 13) e.preventDefault();
                                }

                                /**
                                 * This is the keyup event on the styled select toggle button.
                                 * @param e
                                 * @returns {boolean} or nothing
                                 */
                                function selectKeyUp(e){
                                    // 32 = space bar, 13 = enter key
                                    if (e.keyCode === 32) toggleDropdown();
                                    if (e.keyCode === 13 || e.keyCode === 32) return false;
                                }

                                /**
                                 * Sets the initial focus on our selected option (from the styled select). If there is
                                 * no currently selected option, focus will be set to the first element in the list.
                                 */
                                function setInitialFocus(){
                                    selectedOption = getSelectedOptionElement();
                                    selectedOption.focus();
                                    focusIndex = selectedOption.data('index');
                                }

                                /**
                                 * Shifts our currently focused option up the list (visually).
                                 * @param current - jqLite/jQuery Object, the currently focused option.
                                 */
                                function setPrevFocus(current){
                                    shiftOptionFocus(current, -1);
                                }

                                /**
                                 * Shifts our currently focused option down the list (visually).
                                 * @param current - jqLite/jQuery Object, the currently focused option.
                                 */
                                function setNextFocus(current){
                                    shiftOptionFocus(current, 1);
                                }

                                /**
                                 * Sets the selected option within the scope.options array, which is bound to the
                                 * template for our styled select. It then sets the new option and triggers the change
                                 * event on the original select element.
                                 * @param option - Object from within scope.options
                                 * @param callback - callback Function after selection is set
                                 */
                                function setSelectedOption(option, callback){
                                    angular.forEach(scope.options, function(o){ o.selected = false });
                                    option.selected = true;
                                    $timeout(function(){
                                        element.val(option.value);
                                        element.triggerHandler('change');
                                    },100);
                                    if (angular.isDefined(callback) && typeof(callback) === 'function') callback();
                                }

                                /**
                                 * Shifts focus of options within our styled select, using an offset param.
                                 * @param currentElem - jqLight/jQuery/DOM Object, the currently focused option
                                 * @param offset - Integer (negative or positive) defining how much we want to shift
                                 */
                                function shiftOptionFocus(currentElem, offset){
                                    var focusedOption = angular.element(currentElem),
                                        targetOption,
                                        targetIndex;

                                    focusIndex = getOptionIndexFromElement(focusedOption);
                                    targetIndex = (focusIndex + offset >= 0) ? focusIndex + offset : 0;
                                    targetOption = getOptionElementFromIndex(targetIndex);

                                    if (targetOption) {
                                        targetOption.focus();
                                        focusIndex = getOptionIndexFromElement(targetOption);
                                    }
                                }

                                /**
                                 * Toggle our styled select to be open or closed.
                                 */
                                function toggleDropdown(){
                                    listContainer.toggleClass('zen-ui-select-hidden');
                                    zenSelect.toggleClass('zen-ui-select-open');
                                    setInitialFocus();
                                }
                            });
                    });
                }
            }
        }
    });
