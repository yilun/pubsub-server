var sys = require('sys');
    net = require('net'),
    Buffer = require('buffer').Buffer,

    protocol_version = 1,
    crlf = '\r\n',
    respond_one = ':1\r\n',
    respond_zero = ':0\r\n';

if (typeof process.env.PUBSUB_DEBUG != 'undefined') {
  var dbg = function dbg() {
    sys.debug(Array.prototype.slice.call(arguments).join(' '));
  }
} else {
  var dbg = function dbg() {}
}

function sanitize (what) {
  return what.replace(/\t/g, '<TAB>')
             .replace(/\r\n/g, '<CRLF>')
             .replace(/\r/g, '<CR>')
             .replace(/\n/g, '<LF>');
}

function PubSubServer() {
  this.max_input = 128 * 1024;

  this.channels_ = {};          // name => { id:null, ... }
  this.nicknames_ = {};         // nickname => id
  this.connections_ = 0;        // id generator
}

exports.PubSubServer = PubSubServer;

PubSubServer.prototype.listen = function (port, host) {
  if (this.server)
    throw new Error('already listening');

  this.upsince_ = Date.now();

  var self = this;
  this.server = net.createServer(function (client) {
    dbg(client.remoteAddress, 'connected');

    client.id = self.connections_++;
    client.nickname = 'client.' + client.id.toString(36);
    client.subs = {};    // channel => null

    client.setNoDelay();
    client.setKeepAlive(true);
    client.setEncoding('binary');

    var input = '';
    client.addListener('data', function (chunk) {
      dbg(client.remoteAddress, 'data [' + Buffer.byteLength(chunk) + ' bytes]');

      input += chunk;

      if (input.length > self.max_input) {
        dbg(client.remoteAddress, 'flooding');
        return client.end();
      }

      while (input.length > 0) {
        var m;

        if (m = input.match(/^:pub\t([^\t]+)\t([^\t\r]+)\r\n/)) 
          self.on_publish(client, m[1], m[2]);
        else if (m = input.match(/^:sub\t([^\t\r]+)\r\n/)) 
          self.on_subscribe(client, m[1]);
        else if (m = input.match(/^:unsub\t([^\t\r]+)\r\n/)) 
          self.on_unsubscribe(client, m[1]);
        else if (m = input.match(/^:nick\t([^\t\r]+)\r\n/)) 
          self.on_nickname(client, m[1]);
        else if (m = input.match(/^:chan\r\n/))
          self.on_chan(client);
        else if (m = input.match(/^:info\r\n/)) 
          self.on_info(client);
        else {
          dbg(client.remoteAddress, 'invalid input', sanitize(input.substr(0, 32)));
          client.end();
          break;
        }

        // Leave partial commands in the input string,
        // but eat what we've processed in this iteration.

        if (m) input = input.substr(m[0].length);
      }
    });

    client.addListener('error', function (e) {
      dbg(client.remoteAddress, 'error', e);
      sys.error(e);
      client.end();
    });

    client.addListener('close', function () {
      dbg(client.remoteAddress, 'close');
      client.end();
    });

    client.addListener('end', function () {
      dbg(client.remoteAddress, 'end');
      var subs = Object.keys(client.subs);
      for (var i=0, n=subs.length; i<n; ++i) 
        delete self.channels_[subs[i]][client.id];
      delete self.nicknames_[client.nickname];
    });
  });
  
  this.server.listen(port || 8000, host || '127.0.0.1');
};

function normalize_key(k) {
  return k.toString().trim().replace(/\W/g, '').toLowerCase();
}

PubSubServer.prototype.on_publish = function (client, chan, msg) {
  dbg(client.remoteAddress, 'publish', chan, msg);
  var key = normalize_key(chan);
  var to_send = [ ':msg', chan, client.nickname, msg ].join('\t') + crlf;
  var subscribers = this.channels_[key] || {};
  var ids = Object.keys(subscribers);
  var sent_to = 0;
  for (var i=0, n=ids.length; i<n; ++i) {
    var id = ids[i];
    if (id != client.id) {
      subscribers[id].write(to_send);
      ++sent_to;
    }
  }
  client.write(':' + sent_to + crlf);
};

PubSubServer.prototype.on_subscribe = function (client, chan) {
  dbg(client.remoteAddress, 'subscribe', chan);
  var key = normalize_key(chan);
  if (typeof client.subs[key] != 'undefined')
    return client.write(respond_zero);
  client.subs[key] = null;
  var all_subs = this.channels_[key];
  if (typeof all_subs == 'undefined') this.channels_[key] = {};
  this.channels_[key][client.id] = client;
  return client.write(respond_one);
};

PubSubServer.prototype.on_unsubscribe = function (client, chan) {
  dbg(client.remoteAddress, 'unsubscribe', chan);
  var key = normalize_key(chan);
  var was_sub = typeof client.subs[key] != 'undefined';
  if (was_sub) {
    delete client.subs[key];
    delete this.channels_[key][client.id];
  }
  return client.write(was_sub ? respond_one : respond_zero);
};

PubSubServer.prototype.on_nickname = function (client, nickname) {
  dbg(client.remoteAddress, 'nick', nickname);
  var nick_key = normalize_key(nickname);
  if (normalize_key(client.nickname) == nick_key ||
      typeof this.nicknames_[nick_key] != 'undefined')
    return client.write(respond_zero);
  this.nicknames_[nick_key] = client;
  client.nickname = nickname;
  return client.write(respond_one);
};

PubSubServer.prototype.on_chan = function (client) {
  dbg(client.remoteAddress, 'chan');
  var chan_names = Object.keys(this.channels_);
  var n = chan_names.length;
  var output = [ ':' + n ];
  for (var i=0; i<n; ++i) output.push(chan_names[i]);
  client.write(output.join(crlf) + crlf);
};

PubSubServer.prototype.on_info = function (client) {
  dbg(client.remoteAddress, 'info');
  var output = [ 
    ':3',
    'protocol' + protocol_version,
    'channels ' + Object.keys(this.channels_).length,
    'up ' + this.upsince_
  ];
  return client.write(output.join(crlf) + crlf);
};

