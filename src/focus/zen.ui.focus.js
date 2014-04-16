angular.module('zen.ui.focus', [])
    .directive('focus', function($timeout){
        return {
            restrict: 'A',
            scope: {
                'focus': '=focus'
            },
            link: function(scope, elem){
                scope.$watch('focus', function(val){
                    if (val)
                        $timeout(function(){ elem.focus(); });
                    else
                        $timeout(function(){ elem.blur(); });
                });
            }
        }
    });


directive('focus', function($timeout){
    return {
        restrict: 'A',
        scope: {
            'focus': '=focus'
        },
        link: function(scope, elem){
            scope.$watch('focus', function(val){
                if (val)
                    $timeout(function(){ elem.focus(); });
                else
                    $timeout(function(){ elem.blur(); });
            });
        }
    }
})