api.controller = function($location) {
    var c = this;
    c.currentPage = $location.search().id || 'metro';
};
