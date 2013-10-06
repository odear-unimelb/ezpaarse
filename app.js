/*jslint node: true, maxlen: 100, maxerr: 50, indent: 2 */
'use strict';

var express       = require('express');
var pkg           = require('./package.json');
var config        = require('./lib/config.js');
var http          = require('http');
var path          = require('path');
var crypto        = require('crypto');
var fs            = require('fs');
var folderChecker = require('./lib/folderchecker.js');
var FolderReaper  = require('./lib/folderreaper.js');
var winston       = require('winston');
var passport       = require('passport');
var BasicStrategy  = require('passport-http').BasicStrategy;
require('./lib/init.js');

winston.addColors({ verbose: 'green', info: 'green', warn: 'yellow', error: 'red' });

// Set up cleaning jobs for the temporary folder
var red   = '\u001b[31m';
var reset = '\u001b[0m';
if (!folderChecker.check(path.join(__dirname, '/tmp'))) {
  var err = red;
  err += 'Warning! Temporary folder not found, files won\'t be stored on disk.';
  err += reset;
  console.error(err);
} else if (config.EZPAARSE_TMP_CYCLE && config.EZPAARSE_TMP_LIFETIME) {
  var folderReaper = new FolderReaper({
    recursive: true,
    lifetime: config.EZPAARSE_TMP_LIFETIME
  });
  folderReaper.watch(path.join(__dirname, '/tmp'), config.EZPAARSE_TMP_CYCLE);
} else {
  var err = red;
  err += 'Warning! Temporary folder won\'t be automatically cleaned, ';
  err += 'fill TMP_CYCLE and TMP_LIFETIME in the configuration file.';
  err += reset;
  console.error(err);
}

// to have a nice unix process name
process.title = pkg.name.toLowerCase();

// write pid to ezpaarse.pid file
var optimist = require('optimist')
  .describe('--pidFile', 'the pid file where ezpaarse pid is stored');
if (optimist.argv.pidFile) {
  fs.writeFileSync(optimist.argv.pidFile, process.pid);
}

passport.serializeUser(function (user, done) {
  done(null, user);
});

passport.deserializeUser(function (obj, done) {
  done(null, obj);
});

passport.use(new BasicStrategy(function (userid, password, done) {
    var credentialsFile = path.join(__dirname, 'credentials.json');
    if (fs.existsSync(credentialsFile)) {
      var users = JSON.parse(fs.readFileSync(credentialsFile));
      var cryptedPassword = crypto.createHmac('sha1', 'ezgreatpwd0968')
      .update(userid + password)
      .digest('hex');

      if (users && users[userid] && users[userid] == cryptedPassword) {
        return done(null, { username: userid });
      } else {
        return done(null, false);
      }
    } else {
      done(null, false);
    }
  }
));

var app = express();

// connect ezpaarse env to expressjs env
config.EZPAARSE_ENV = process.env.NODE_ENV || config.EZPAARSE_ENV;
app.set('env', config.EZPAARSE_ENV);

app.configure('development', function () {
  // http://www.senchalabs.org/connect/middleware-logger.html
  app.use(express.logger('dev'));
  
  app.use(express.errorHandler());
});
app.configure('production', function () {
  // http://www.senchalabs.org/connect/middleware-logger.html
  app.use(express.logger({
    stream: fs.createWriteStream(path.join(__dirname, '/logs/access.log'), { flags: 'a+' })
  }));
});

app.configure(function () {
  app.set('port', config.EZPAARSE_NODEJS_PORT || 3000);
  
  // for dynamics HTML pages (ejs template engine is used)
  // https://github.com/visionmedia/ejs
  app.set('views', path.join(__dirname, '/views'));
  app.set('view engine', 'ejs');

  // used to expose a favicon in the browser
  // http://www.senchalabs.org/connect/middleware-favicon.html
  // todo: favico should be created
  app.use(express.favicon());

  app.use(express.methodOverride());
  app.use(express.cookieParser());
  app.use(express.session({ secret: 'AppOfTheYearEzpaarse' }));

  app.use(passport.initialize());
  app.use(passport.session());
  
  // Set the ezPAARSE-Version header in all responses
  app.use(function (req, res, next) {
    res.header('ezPAARSE-Version', pkg.version || 'N/A');
    next();
  });

  // calculate the baseurl depending on reverse proxy variables
  app.use(function (req, res, next) {
    req.ezBaseURL = 'http://' + (req.headers['x-forwarded-host'] || req.headers.host);
    next();
  });

  // Ask for basic authentification if ?auth=local
  // Render admin creation form if credentials.json does not exist
  app.use(function (req, res, next) {
    if (req.query.auth && req.query.auth == 'local') {
      var credentialsFile = path.join(__dirname, 'credentials.json');

      if (fs.existsSync(credentialsFile)) {
        (passport.authenticate('basic', { session: true }))(req, res, next);
      } else {
        res.render('register', { title: 'ezPAARSE - Register', user: false });
      }
    } else {
      next();
    }
  });

  // routes handling
  app.use(app.router);
  
  // used to expose static files from the public folder
  app.use(express.static(path.join(__dirname, 'public')));
});

// log related routes
require('./routes/ws')(app);
require('./routes/info')(app);
require('./routes/logs')(app);
require('./routes/admin')(app);

var server = http.createServer(app);

require('./lib/socketio.js').listen(server);

server.listen(app.get('port'), function () {
  console.log(pkg.name + "-" + pkg.version +
    " listening on http://localhost:" + app.get('port') + " (pid is " + process.pid + ")");
});
