## PubSubServer

PubSubServer is a Node.js module that provides a very simple PUBSUB server over
TCP/IP.  There is no pattern-based subscriptions, store-and-forward, nor any
sort of "exchange".  Included is a Node.js client that speaks the protocol.

If you'd like to use this from the web, consider [Orbited](http://orbited.org)
or adding support for [Socket.IO](http://github.com/LearnBoost/Socket.IO-node).

## System Requirements

Tested with Node.js 0.1.95.

## Running

    bin/pubsub-server [--port=8000] [--host=127.0.0.1]

## Example

In a terminal:

    $ bin/pubsub-server 

In another terminal:

    $ bin/create-publisher 
    published to 0 subscribers
    published to 0 subscribers
    published to 1 subscribers             <-- connection (below)
    published to 1 subscribers
    published to 1 subscribers
    published to 0 subscribers
    published to 0 subscribers
    ^C

In yet another terminal:

    $ bin/create-subscriber 
    recv msg from client "client.1a" on channel "time": 1274727085985
    recv msg from client "client.1a" on channel "time": 1274727086985
    recv msg from client "client.1a" on channel "time": 1274727087985
    ^C

## Protocol

    -> :pub\t$chan\t$msg\r\n          publish message to channel
    <- :n\r\n                         delivered to n subscribers

    <- :msg\t$chan\t$from\t$msg\r\n   sent to a subscriber on 'pub'

    -> :sub\t$chan\r\n                subscribe to a channel
    <- :0\r\n or :1\r\n

    -> :unsub\t$chan\r\n              unsubscribe from a channel
    <- :0\r\n or :1\r\n

    -> :nick\t$nickname\r\n           set a user-defined nickname
    <- :0\r\n or :1\r\n

    -> :chan\r\n                      list channels with subscribers
    <- :n\r\n                         n lines follow
    chan\r\n
    ...

    -> :info\r\n                      get server metadata
    <- :n\r\n                         n lines follow
    protocol \d+\r\n                  protocol version
    node x.y.z\r\n                    Node.js version
    channels \d+\r\n                  number of channels
    up \d+\r\n                        epoch time of launch

