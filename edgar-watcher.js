
var configPath = process.argv[2] || './config.json';

var request = require('request'),
    fs = require('fs'),
    exec = require('child_process').exec,
    Diff2Html = require('diff2html').Diff2Html,
    pg = require('pg'),
    cheerio = require('cheerio'),
    config = require(configPath);

function handleError(err) {
    if (err) {
        console.log('Error:');
        console.log(err);
        return true;
    }

    return false;
}

function multiGet(urls, cb) {
    var results = {},
    countFinished = 0;

    function handler(error, response, body) {
        var url = response.request.uri.href;

        results[url] = { error: error, response: response, body: body };

        if (++countFinished === urls.length) {
            cb(results);
        }
    };

    for (var i = 0; i < urls.length; ++i) {
        request(urls[i], handler);
    }
};

function diffDocs(url1, url2, cb) {
    exec('w3m -dump -cols 200 ' + url1 + ' > doc1.txt', function(err) {
        exec('w3m -dump -cols 200 ' + url2 + ' > doc2.txt', function(err) {
            exec('git diff --ignore-all-space --no-index doc1.txt doc2.txt', function(err, stdout) {
                cb(stdout);
            });
        });
    });
}

function buildDiffHtml(body) {
    return '<!doctype html>' +
        '<html lang="en">' +
        '<head>' +
            '<meta charset="utf-8">' +
     
            '<link rel="stylesheet" href="./s1-static/github.min.css">' +
     
            '<link rel="stylesheet" type="text/css" href="./s1-static/diff2html.min.css">' +
            '<script type="text/javascript" src="./s1-static/diff2html.min.js"></script>' +
     
        '</head>' +
        '<body style="text-align: center; font-family: \'Source Sans Pro\',sans-serif;">' +
         
        body +
     
        '</body>' +
        '</html>';
}

function typeFromTitle(title) {
    var normTitle = title.toUpperCase().trim();

    if (normTitle.indexOf('S-1') == 0) { return 'S-1'; }
    if (normTitle.indexOf('CT ORDER') == 0) { return 'CT ORDER'; }
    if (normTitle.indexOf('S-8') == 0) { return 'S-8'; }
    if (normTitle.indexOf('EFFECT') == 0) { return 'EFFECT'; }
    if (normTitle.indexOf('CERTNYS') == 0) { return 'CERTNYS'; }
    if (normTitle.indexOf('FWP') == 0) { return 'FWP'; }
    if (normTitle.indexOf('8-A12B') == 0) { return '8-A12B'; }
    if (normTitle.indexOf('DRS') == 0) { return 'DRS'; }
    if (normTitle.indexOf('D') == 0) { return 'D'; }

    return 'UNKNOWN';
}

function findOlderVersionOfEntry(entry, feed, cb) {
    var entryType = typeFromTitle(entry.title);

    console.log(config.databaseUrl)
    pg.connect(config.databaseUrl, function(err, client, done) {
        if (handleError(err)) { return done(true); }

        // slect all the entries because we don't have a way to filter on filing type
        client.query('SELECT * from entries WHERE feed = $1 ORDER BY date DESC', [feed], function(err, result) {
            if (handleError(err)) { return done(true); }

            for (var i = 0; i < result.rows.length; ++i) {
                var row = result.rows[i];

                if (typeFromTitle(row.title) == entryType && row.link != entry.link) {
                    // found the most recent previous filing of the same type
                    console.log(row);
                    cb(row);
                    break;
                }
            }

            done();
        });
    });
}

var url1 = 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515343733/d937622ds1.htm',
    url2 = 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515352937/d937622ds1a.htm';

var filing1 = 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515378578/0001193125-15-378578-index.htm',
    feed = 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001512673&type=&dateb=&owner=exclude&start=0&count=40&output=atom',
    entry = {
        'title': 'S-1/A - stuff...',
        'link': 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515378578/0001193125-15-378578-index.htm'
    }

findOlderVersionOfEntry(entry, feed, function(oldEntry) {

});



// diffDocs(url1, url2, function(diff) {
//     var body = Diff2Html.getPrettyHtml(diff, { inputFormat: 'diff' }),
//         html = buildDiffHtml(body);

//     fs.writeFileSync('index.html', html);
// });
