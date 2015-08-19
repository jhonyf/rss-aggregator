var async = require("async"),
  xml2js = require("xml2js"),
  request = require("request"),
  http = require("http"),
  Q = require("q"),
  dispatcher = require("httpdispatcher");;

// Ordered list of xml feeds to parse
var RSS_FEEDS = process.env.RSS_FEEDS ? process.env.RSS_FEEDS.split(",") : [
    "http://www.rotoworld.com/rss/feed.aspx?sport=nfl&ftype=news&count=12&format=rss",
    "http://www.rotoworld.com/rss/feed.aspx?sport=mlb&ftype=news&count=12&format=rss",
    "http://www.rotoworld.com/rss/feed.aspx?sport=cfb&ftype=news&count=12&format=rss",
    "http://www.rotoworld.com/rss/feed.aspx?sport=nba&ftype=news&count=12&format=rss"
];

var port = process.env.PORT || 8888;

// Parses external rss feed into xml
function parseXML(url) {
    var parser = new xml2js.Parser();
    var deferred = Q.defer();

    request(url, function (error, response, body) {
        if (error) {
            deferred.reject(new Error(error));
        } else if (response.statusCode == 200) {
            parser.parseString(body, function (error, result) {
                if (error) {
                    deferred.reject(new Error(error));
                } else {
                    deferred.resolve(result);
                }
          });
        } else {
            deferred.reject(new Error("Invalid response code"));
        }
    });
    return deferred.promise;
}

// Retrieves the items object from the feed
function extractFeedItems(promise, callback) {
     promise.then(function (responseText) {
        return callback(null, responseText.rss.channel[0].item);
     }, function (error) {
        console.log(error);
        return callback(null, []);
     });
};

// Combines multiple RSS feeds into one
function aggregateFeed(callback) {
    var promises = RSS_FEEDS.map(parseXML);

    async.mapSeries(promises, extractFeedItems, function(err, results) {
        // flatten feed items into single array
        results = results.reduce(function(a, b) {
            return a.concat(b);
        });
        var xml = buildXML(results);
        callback(xml);
    });
};

// Creates an RSS xml structure
function buildXML(items) {
    var builder = new xml2js.Builder();
    var xml = {
        rss: {
            '$': {
                'xmlns:a10': 'http://www.w3.org/2005/Atom',
                version: '2.0'
            },
            channel: [{
                title: [ 'Fantasy News' ],
                description: [ 'Fantasy News' ],
                language: [ 'en-us' ],
                lastBuildDate: [ (new Date()).toString() ],
                item: items
            }]
        }
    };
    return builder.buildObject(xml);
}

// Server stuff
function handleRequest(request, response){
    try {
        dispatcher.dispatch(request, response);
    } catch(err) {
        console.log(err);
    }
};

dispatcher.onGet("/rss", function(req, res) {
    aggregateFeed(function(xml) {
        res.writeHead(200, {'Content-Type': 'application/xml'});
        res.write(xml);
        res.end();
    });
});

http.createServer(handleRequest).listen(port);
