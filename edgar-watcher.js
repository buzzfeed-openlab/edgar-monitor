
var request = require('request'),
    fs = require('fs'),
    exec = require('child_process').exec,
    Diff2Html = require('diff2html').Diff2Html;

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

var url1 = 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515343733/d937622ds1.htm',
    url2 = 'https://www.sec.gov/Archives/edgar/data/1512673/000119312515352937/d937622ds1a.htm';

diffDocs(url1, url2, function(diff) {
    var body = Diff2Html.getPrettyHtml(diff, { inputFormat: 'diff' }),
        html = buildDiffHtml(body);

    fs.writeFileSync('index.html', html);
});
