// cf. https://scrapbox.io/discordjs-japan/Glitch%E3%81%A7BOT%E3%82%92%E4%BD%9C%E3%82%8B%E6%89%8B%E9%A0%86

import * as http from 'http';
import * as querystring from 'node:querystring';

export function serve() {
  http
    .createServer((req, res) => {
      if (req.method === 'POST') {
        let data = '';
        req.on('data', chunk => {
          data += chunk;
        });
        req.on('end', () => {
          if (!data) {
            res.end('No post data');
            return;
          }
          const dataObject = querystring.parse(data);
          console.log('post:' + dataObject.type);
          if (dataObject.type === 'wake') {
            console.log('Woke up in post');
            res.end();
            return;
          }
          res.end();
        });
      } else if (req.method === 'GET') {
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end('Discord Bot is Oprateing!');
      }
    })
    .listen(process.env.PORT || 3000);
}
