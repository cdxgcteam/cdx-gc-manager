
/*
 * GET home page.
 */

exports.index = function(req, res){
	res.render('index', {
		title: 'CDX Greycell Manager',
		current_url: '/'
	});
};

exports.viewalltasks = function(req, res){
	res.render('viewalltasks', {
		title: 'CDX Greycell Manager',
		current_url: '/viewalltasks'
	});
};

exports.admin = function(req, res){
	res.render('admin', {
		title: 'CDX Greycell Manager',
		current_url: '/admin'
	});
};
