
/**
 * Module dependencies.
 */

var fs = require("fs"),
		gs = require('../');

var express = require('express');
var http = require('http');
var path = require('path');

// middleware
var compress = require('compression');
var methodOverride = require('method-override');
var bodyParser = require('body-parser');
var logger = require('morgan');
var errorHandler = require('errorhandler');


var port;


var app = express();
app.locals.moment = require('moment');

var reps = path.resolve('./repos');

  gs.repositories(reps);
  
  // all environments
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'jade');

  app.use(function (req, res, next) {
      if ('/robots.txt' == req.url) {
          res.type('text/plain')
          res.send("User-agent: *\nDisallow: /");
      } else {
          next();
      }
  });



  app.use(compress());
  app.use(logger('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: true }));

  app.use(methodOverride());
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(require('stylus').middleware(path.join(__dirname, 'public')));
  //app.use(app.router);

  // development only
  if ('development' == app.get('env')) {
    app.use(errorHandler());
  }
  
/*
  app.get('/', function(req, res){
    fs.readdir(gs.repositories(), function(err, files){
      var folders = files.map(function(file) {
        return path.join(gs.repositories(), file);
      }).filter(function(file){
        return fs.statSync(file).isDirectory();
      }).map(function(folder){
        // Clean up the name
        return folder.replace(gs.repositories() + '/', '');
      });
      
      console.log(folders)
      res.render('index', { baseUrl: req.baseUrl, page_title: 'Repositories', repos: folders });
    });
  });
*/
  
  app.get('/:repo?', function(req, res){
    var repo = req.params.repo
    gs.getBranches(repo, function(err, branches){
      res.render('repo', { baseUrl: req.baseUrl, page_title: repo, repo: repo, branches: branches });
    });
  });

  app.get('/:repo/:branch?', function(req, res){
    var repo = req.params.repo,
        branch = req.params.branch;
    gs.getBranchCommits(repo, branch, function(err, commits){
      res.render('branch', { baseUrl: req.baseUrl, page_title: repo + ' - ' + branch, repo: repo, branch: branch, commits: commits });
    });
  });

  app.get('/:repo/:branchOrBranch/:file?*', gs.route());

/*
  http.createServer(app).listen(app.get('port'), function(){
    console.log('Express server listening on port ' + app.get('port'));
  });
*/



exports.gitStatic = app
