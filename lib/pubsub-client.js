var sys = require('sys');
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var tab = '\t';
var crlf = '\r\n';

function Client(port, host) {
  EventEmitter.call(this);

  this.max_input = 128*1024;
  this.pending = [];

  this.conn = net.createConnection(port || 8000, host || '127.0.0.1');

  var self = this;

  var input = '';
  this.conn.addListener('data', function (chunk) {
    input += chunk;

    if (input.length > this.max_input)
      throw new Error('too much input, server flooding?');

    while (input.length > 0) {
      var match = input.match(/^:msg\t([^\t]+)\t([^\t]+)\t([^\t\r]+)\r\n/);

      if (match) {
        self.emit('message', match[1], match[2], match[3]);
        input = input.substr(match[0].length);
      } else {
        var pending = self.pending.shift();
        if (/^(pub|sub|unsub|nick)$/.test(pending[0])) {
          match = input.match(/^:(\d+)\r\n/);
          if (!match) throw new Error('protocol error: ' + input);
          if (typeof pending[1] == 'function')
            pending[1](parseInt(match[1], 10));
          input = input.substr(match[0].length);
        } else if (/^(chan|info)$/.test(pending[0])) {
          match = input.match(/^:(\d+)\r\n/);
          if (!match) throw new Error('protocol error: ' + input);
          var backup = input;
          input = input.substr(match[0].length);
          var info = {};
          for (var i=0, n=parseInt(match[1], 10); i<n; ++i) {
            line_match = input.match(/^(.+)\r\n/);
            if (!line_match) {
              input = backup;     // partial command in buffer, so wait.
              return;
            }
            input = input.substr(line_match[0].length);
            var parts = line_match[1].match(/^(\S+)(?:\s+(.+))?/);
            info[parts[1]] = parts[2];
          }
          if (typeof pending[1] == 'function')
            pending[1](info);
        }
      }
    }
  });

  this.conn.addListener('connect', function () {
    self.conn.setEncoding('binary');
    self.emit('connect');
  });
}

sys.inherits(Client, EventEmitter);
exports.Client = Client;

Client.prototype.set_nickname = function (nick, callback) {
  this.pending.push([ 'nick', callback ]);
  this.conn.write([ ':nick', nick ].join(tab) + crlf);
};

function no_tabs (input) {
  return input.replace(/\t/g, '');
}

Client.prototype.publish = function (chan, msg, callback) {
  this.pending.push([ 'pub', callback ]);
  this.conn.write([ ':pub', no_tabs(chan), no_tabs(msg) ].join(tab) + crlf);
};

Client.prototype.subscribe = function (chan, callback) {
  this.pending.push([ 'sub', callback ]);
  this.conn.write([ ':sub', no_tabs(chan) ].join(tab) + crlf);
};

Client.prototype.unsubscribe = function (chan, callback) {
  this.pending.push([ 'unsub', callback ]);
  this.conn.write([ ':unsub', no_tabs(chan) ].join(tab) + crlf);
};

Client.prototype.get_active_channels = function (callback) {
  this.pending.push([ 'chan', callback ]);
  this.conn.write(':chan\r\n');
};

Client.prototype.get_metadata = function (callback) {
  this.pending.push([ 'info', callback ]);
  this.conn.write(':info\r\n');
};

