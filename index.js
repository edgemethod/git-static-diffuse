var child = require("child_process"),
    mime = require("mime"),
    path = require("path"),
    moment = requore("moment");

var shaRe = /^[0-9a-f]{40}$/,
    emailRe = /^<.*@.*>$/;

var repositories;

function readBlob(repositories, repository, revision, file, callback) {
  var git = child.spawn("git", ["cat-file", "blob", revision + ":" + file], {cwd: repositories + '/' + repository}),
      data = [],
      exit;

  git.stdout.on("data", function(chunk) {
    data.push(chunk);
  });

  git.on("exit", function(code) {
    exit = code;
  });

  git.on("close", function() {
    if (exit > 0) return callback(error(exit));
    callback(null, Buffer.concat(data));
  });

  git.stdin.end();
}

exports.readBlob = readBlob;

exports.getBranches = function(repository, callback) {
  child.exec("git branch -l", {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(s) { return s.slice(2); }));
  });
};

exports.getSha = function(repository, revision, callback) {
  child.exec("git rev-parse '" + revision.replace(/'/g, "'\''") + "'", {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.trim());
  });
};

exports.getBranchCommits = function(repository, branch, callback) {
  child.exec("git log " + branch, {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    console.log(stdout)
    // Split and filter for empty rows
    var commits = stdout.trim().split("commit").filter(function(commit){ return commit });
    commits = commits.map(function(commit){
      var fields = commit.replace('\n\n','\n').split('\n').map(function(line){ return line.trim() }).filter(function(line){ return line });
      return {
        sha: fields[0],
        author: fields[1].split(' ')[1],
        date: fields[2].split('Date:')[1].trim(),
        message: fields[3]
      }
    })
    callback(null, commits);
  });
};

exports.getCommit = function(repository, revision, callback) {
  if (arguments.length < 3) callback = revision, revision = null;
  child.exec(shaRe.test(revision)
      ? "git log -1 --date=iso " + revision + " --format='%H\n%ad'"
      : "git for-each-ref --count 1 --sort=-authordate 'refs/heads/" + (revision ? revision.replace(/'/g, "'\''") : "") + "' --format='%(objectname)\n%(authordate:iso8601)'", {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    var lines = stdout.split("\n"),
        sha = lines[0],
        date = new Date(lines[1]);
    if (!shaRe.test(sha) || isNaN(date)) return void callback(new Error("unable to get commit"));
    callback(null, {
      sha: sha,
      date: date
    });
  });
};

exports.getRelatedCommits = function(repository, branch, sha, callback) {
  if (!shaRe.test(sha)) return callback(new Error("invalid SHA: " + sha));
  child.exec("git log --format='%H' '" + branch.replace(/'/g, "'\''") + "' | grep -C1 " + sha, {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    var shas = stdout.split(/\n/),
        i = shas.indexOf(sha);

    callback(null, {
      previous: shas[i + 1],
      next: shas[i - 1]
    });
  });
};

exports.listCommits = function(repository, sha1, sha2, callback) {
  if (!shaRe.test(sha1)) return callback(new Error("invalid SHA: " + sha1));
  if (!shaRe.test(sha2)) return callback(new Error("invalid SHA: " + sha2));
  child.exec("git log --format='%H\t%ad' " + sha1 + ".." + sha2, {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(commit) {
      var fields = commit.split(/\t/);
      return {
        sha: fields[0],
        date: new Date(fields[1])
      };
    }));
  });
};

exports.listAllCommits = function(repository, callback) {
  child.exec("git log --branches --format='%H\t%ad'", {cwd: repositories + '/' + repository}, function(error, stdout) {
    if (error) return callback(error);
    callback(null, stdout.split(/\n/).slice(0, -1).map(function(commit) {
      var fields = commit.split(/\t/);
      return {
        sha: fields[0],
        date: new Date(fields[1])
      };
    }));
  });
};

exports.repositories = function(repositories_){
  if (!arguments.length) return repositories;
  repositories = repositories_;
  return this;
}

exports.route = function() {
  repositories = repositories || defaultRepositories();

  var repository = defaultRepository,
      revision = defaultRevision,
      file = defaultFile,
      type = defaultType;


  function route(request, response) {
    var repository_,
        revision_,
        file_;

    if (    repositories   == undefined
        ||  (repository_   = repository(request.url))   == undefined
        || (revision_      = revision(request.url))     == undefined
        || (file_          = file(request.url))         == undefined
      )  return serveNotFound();
    
    readBlob(repositories, repository_, revision_, file_, function(error, data) {
      if (error) return error.code === 128 ? serveNotFound() : serveError(error);
      response.writeHead(200, {
        "Content-Type": type(file_),
        "Cache-Control": "public, max-age=300"
      });
      response.end(data);
    });

    function serveError(error) {
      response.writeHead(500, {"Content-Type": "text/plain"});
      response.end(error + "");
    }

    function serveNotFound() {
      if (!request.url.match("index.html$")) {
        var possibleIndex = request.baseUrl + request.url.replace(/\/$/,'') + '/index.html';
        response.redirect(possibleIndex);
      } 
      else {
        response.writeHead(404, {"Content-Type": "text/plain"});
        response.end("File not found.");          
      }
    }
  }

  route.repositories = function(_) {
    if (!arguments.length) return repositories;
    repositories = functor(_);
    return route;
  };

  route.repository = function(_) {
    if (!arguments.length) return repository;
    repository = functor(_);
    return route;
  };

  route.sha = // sha is deprecated; use revision instead
  route.revision = function(_) {
    if (!arguments.length) return revision;
    revision = functor(_);
    return route;
  };

  route.file = function(_) {
    if (!arguments.length) return file;
    file = functor(_);
    return route;
  };

  route.type = function(_) {
    if (!arguments.length) return type;
    type = functor(_);
    return route;
  };

  return route;
};

function functor(_) {
  return typeof _ === "function" ? _ : function() { return _; };
}

function defaultRepositories() {
  return path.join(__dirname, "repositories");
}

function defaultRepository(url) {
  var dirs = url.substring(1).split('/');
  return dirs[0] || undefined;
}

function defaultRevision(url) {
  var dirs = url.substring(1).split('/');
  return dirs[1] || undefined;
}

function defaultFile(url) {
  var dirs = url.substring(1).split('/');
  return dirs.slice(2, dirs.length).join('/') || undefined;
}

function defaultType(file) {
  var type = mime.lookup(file, "text/plain");
  return text(type) ? type + "; charset=utf-8" : type;
}

function text(type) {
  return /^(text\/)|(application\/(javascript|json)|image\/svg$)/.test(type);
}

function error(code) {
  var e = new Error;
  e.code = code;
  return e;
}
