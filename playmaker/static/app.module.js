var app = angular.module('playmaker', [
  'ngRoute',
  'ui.bootstrap'
]);

app.config(['$locationProvider', '$routeProvider',
  function config($locationProvider, $routeProvider) {
//    $locationProvider.html5Mode({
//      enabled: true,
//      requireBase: false
//    });

    $routeProvider.
      when('/', {
        template: '<app-list></app-list>'
      }).
      when('/search', {
        template: '<search-view></search-view>'
      }).
      when('/login', {
        template: '<login-view></login-view>'
      }).
      otherwise('/');
  }
]).run(['$rootScope', '$location', 'global', function ($rootScope, $location, global) {
    $rootScope.$on('$routeChangeStart', function (event, next, current) {

      console.log($location.path());
      if (!global.auth.isLoggedIn() &&
          $location.path() !== '/login') {
        event.preventDefault();
        $location.path('/login');
      } else if (global.auth.isLoggedIn() &&
                 $location.path() === '/login') {
        // redirect home
        event.preventDefault();
        $location.path('/');
      }

    });
}]);


app.component('appList', {
  templateUrl: '/views/app.html',
  controller: function AppController(api, global) {
    var ctrl = this;

    ctrl.check = function() {
      global.addAlert('info', 'Checking for updates');
      api.check(function(data) {
        if (data === 'err') {
          global.addAlert('danger', 'Cannot check for updates');
          return;
        }
        if (data.length === 0) {
          global.addAlert('success', 'All apps are up-to-date!');
        }
        if (data.length > 0) {
          global.addAlert('info', data.length.toString() + ' apps must be updated');

          data.forEach(function(newApp) {
            var oldAppIndex = ctrl.apps.findIndex(function(elem) {
              return elem.docId === newApp;
            });
            if (oldAppIndex === -1) return;
            ctrl.apps[oldAppIndex].needsUpdate = true;
          });
        }
      });
    };

    ctrl.downloadApp = function(app) {
      api.download(app.docId, function(data) {
        if (data.success.length === 0) return;
        newApp = data.success[0];
      });
    };

    ctrl.updateApp = function(app) {
      app.needsUpdate = false;
      app.updating = true;
      api.download(app.docId, function(data) {
        if (data === 'err') {
          global.addAlert('danger', 'Unable to update ' + app.docId);
          app.updating = false;
          return;
        }
        if (data.success !== undefined && data.success.length === 0) {
          global.addAlert('danger', 'Unable to update ' + app.docId);
          app.updating = false;
          return;
        }
        app.version = data.success[0].versionCode;
        app.updating = false;
      });
    };

    ctrl.delete = function(app) {
      api.remove(app.docId, function(data) {
        if (data === 'OK') {
          var i = ctrl.apps.findIndex(function(elem) {
            return elem.docId === app.docId;
          });
          ctrl.apps.splice(i, 1);
        } else {
          global.addAlert('danger', 'Unable to delete ' + app.docId);
        }
      });
    };

    ctrl.fdroid = function() {
      global.addAlert('info', 'Updating fdroid repository');
      api.fdroid(function (data) {
        if (data === 'err') {
          global.addAlert('danger', 'Error updating repository');
          return;
        }
        if (data === 'PENDING') {
          global.addAlert('warning', 'Update process still running');
          return;
        }
        if (data === 'OK') {
          global.addAlert('success', 'Fdroid repository updated succesfully');
        }
      });
    };

    api.getApps(function(data) {
      var apps = data;
      apps.forEach(function(a) {
        a.updating = false;
        a.needsUpdate = false;
      });
      ctrl.apps = apps;
    });
  }
});

app.directive('onEnter', function() {
  return function(scope, element, attrs) {
    element.bind("keydown keypress", function (event) {
      if(event.which === 13) {
        scope.$apply(function (){
          scope.$eval(attrs.onEnter);
        });

        event.preventDefault();
      }
    });
  };
});

app.component('searchView', {
  templateUrl: '/views/search.html',
  controller: function SearchController($uibModal, api, global) {
    var ctrl = this;
    ctrl.desktop = global.desktop;
    ctrl.mobile = global.mobile;
    ctrl.results = [];
    ctrl.searching = false;

    ctrl.modalOpen = function (item) {
      $uibModal.open({
        animation: true,
        ariaLabelledBy: 'modal-title',
        ariaDescribedBy: 'modal-body',
        templateUrl: 'myModalContent.html',
        controller: function($scope) {
          $scope.app = item;
        }
      });
    };

    ctrl.search = function(app) {
      // no input by the user
      if (app === undefined) return;
      ctrl.results = [];
      ctrl.searching = true;
      api.search(app, function(data) {
        if (data === 'err') {
          global.addAlert('danger', 'Error while searching');
          ctrl.searching = false;
          return;
        }
        if (data !== undefined && data.length === 0) {
          global.addAlert('danger', 'No result for "' + app + '"');
          ctrl.searching = false;
          return;
        }
        data.forEach(function(d) {
          d.dling = false;
          d.dled = false;
        });
        ctrl.results = data;
        ctrl.searching = false;
      });
    };

    ctrl.download = function(app) {
      app.dling = true;
      api.download(app.docId, function(data) {
        if (data === 'err') {
          global.addAlert('danger', 'Error downloading app');
          app.dling = false;
          return;
        }
        if (data !== undefined && data.success.length === 0) {
          app.dling = false;
          return;
        }
        app.dling = false;
        app.dled = true;
      });
    };
  }
});

app.component('loginView', {
  templateUrl: '/views/login.html',
  controller: function LoginController(api, global) {
    var ctrl = this;

    ctrl.login = function(user) {
      if (user.email === '' || user.password === '') {
        //TODO: error
        return;
      }

      var message = user.email + '\x00' + user.password;
      var hash = CryptoJS.SHA256(message);
      var salt = CryptoJS.lib.WordArray.random(128/8);
      //using sha256(message) as key
      var key = CryptoJS.PBKDF2(hash.toString(), salt, {
        keySize: 32,
        iterations: 100
      });
      console.log(key);
      var iv = CryptoJS.lib.WordArray.random(128/8);
      var encrypted = CryptoJS.AES.encrypt(message, key, { 
        iv: iv, 
        padding: CryptoJS.pad.Pkcs7,
        mode: CryptoJS.mode.CBC
      });
      var cyphertext = salt.toString() + iv.toString() + encrypted.toString();
      console.log('salt: ' + salt.toString());
      console.log('iv: ' + iv.toString());
      console.log('encrypted: ' + encrypted.toString());

      api.login(cyphertext, hash.toString(), function(data) {
        if (data === 'err') {
          console.log('error login')
        }
      });
    }
  }
});
