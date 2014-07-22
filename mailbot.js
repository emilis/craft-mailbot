/// Requirements: --------------------------------------------------------------

var config =    require( "config" );
var fs =        require( "fs" );
var UC =        require( "craft-client/user-connection" );

/// Constants: -----------------------------------------------------------------

var PRIVMSG =   "user/private-message";

var MESSAGES =  "messages.json";
var PLAYERS =   "players.json";
var ENCODING =  "utf8";

var MSGDELAY =  3000;

/// Main: ----------------------------------------------------------------------

var messages =  loadData( MESSAGES );
var players =   loadData( PLAYERS );

var pids =      {};

/// User connection instance:
var uc =        UC.open( config.HOST, config.PORT, config.NAME, config.IDENT );

uc.on( "T", log );
uc.on( "U", log );
uc.on( "N", log );
uc.on( PRIVMSG, log );

uc.on( PRIVMSG, parseMessage );
uc.on( "N", onPlayerJoin );
uc.on( "D", onPlayerLeave );
uc.on( "connect", onConnect );

/// REPL: ----------------------------------------------------------------------

global.UC =         UC;
global.uc =         uc;
global.messages =   messages;
global.players =    players;
global.send =       uc.send;
global.t =          uc.send.bind( this, "T" );
global.list =       uc.send.bind( this, "T", "/list" );
global.saveData =   saveData;

require( "repl" ).start({
    prompt:     "mailbot> ",
    useGlobal:  true,
}).on( "exit", process.exit.bind( process, 0 ));

/// Functions: -----------------------------------------------------------------

function log(){

    var args =  Array.prototype.slice.call( arguments );
    var time =  (new Date).toISOString();
    args.unshift( time );

    console.log.apply( console, args );
}///

function msg( to, msg ){

    uc.send( "T", "@" + Array.prototype.join.call( arguments, " " ));
}///

function isUser( name ){

    return name.slice( 0, 5 ) !== "guest";
}///

function parseMessage( toBot, fromPlayer, message ){

    var UNKNOWN =   "I am sorry, I didn't understand that."; /// Don't change this!
    var privMsg =   /^@([^ @]+)\s+(.*)$/;
    var pubMsg =    /^@@\s+(.*)$/;
    var seenCmd =   /^seen (\S+)/;
    var matches;

    if ( message === UNKNOWN ){
        /// do nothing ( prevent two bots from messaging each other eternally ).
    } else if ( !isUser( fromPlayer )){
        msg( fromPlayer, "Nice to meet you. Please authenticate and I may help you :)" );
    } else if ( message === "ls" ){
        onList( fromPlayer );
    } else if ( message === "la" ){
        onListAll( fromPlayer );
    } else if ( message === "lp" ){
        onListAllPublic( fromPlayer );
    } else if ( message === "help" ){
        onHelp( fromPlayer );
    } else if ( matches = message.match( seenCmd )){
        onSeen( fromPlayer, matches[1] );
    } else if ( matches = message.match( privMsg )){
        onNewMessage( fromPlayer, matches[1], message );
    } else if ( matches = message.match( pubMsg )){
        onPubMessage( fromPlayer, message );
    } else {
        msg( fromPlayer, UNKNOWN );
    }
}///

/// Bot commands: --------------------------------------------------------------

function onList( name ){

    var player =        getPlayer( name );
    var lastRead =      player.lastRead || 0;
    var messages =      getMessages( name );
    var lastPublic =    player.lastPublic || 0;
    var pubMessages =   getMessages( "@" );

    if ( !messages.length && !pubMessages.length ){
        msg( name, "You have no messages." );
    } else if ( messages.length <= lastRead && pubMessages.length <= lastPublic ){
        msg( name, "You have no unread messages." );
    } else {
        messages.slice( lastRead ).concat( pubMessages.slice( lastPublic )).forEach( showMessage.bind( this, name ));
        player.lastRead =   messages.length;
        player.lastPublic = pubMessages.length;
        saveData();
    }
}///

function onListAll( name ){

    var player =    getPlayer( name );
    var messages =  getMessages( name );

    if ( !messages.length ){
        msg( name, "You have no messages." );
    } else {
        messages.forEach( showMessage.bind( this, name ));
        players.lastRead =  messages.length;
        saveData();
    }
}///

/*
/// Not used anymore – merged into onList().
function onListPublic( name ){

    var player =        getPlayer( name );
    var lastPublic =    player.lastPublic || 0;
    var messages =      getMessages( "@" );

    if ( !messages.length ){
        msg( name, "There are no public messages." );
    } else if ( messages.length <= lastPublic ){
        msg( name, "There are no unread public messages." );
    } else {
        messages.slice( lastPublic ).forEach( showMessage.bind( this, name ));
        player.lastPublic = messages.length;
        saveData();
    }
}///
*/

function onListAllPublic( name ){

    var player =        getPlayer( name );
    var messages =      getMessages( "@" );

    if ( !messages.length ){
        msg( name, "There are no public messages." );
    } else {
        messages.forEach( showMessage.bind( this, name ));
        player.lastPublic = messages.length;
        saveData();
    }
}///

function showMessage( toPlayer, message, n ){
    
    setTimeout(function(){
        msg( toPlayer, n, agoStr( message.time ), message.from, ":", message.msg );
    }, n * MSGDELAY );
}///

function onNewMessage( from, to, msg ){

    var time =      +new Date;
    getMessages( to ).push({
        from:       from,
        time:       time,
        msg:        msg,
    });
    saveData();
}///

function onPubMessage( from, msg ){

    onNewMessage( from, "@", msg );
}///

function onSeen( from, name ){

    for ( var pid in pids ){
        if ( pids[pid] === name ){
            msg( from, "Player", name, "is online now." );
            return;
        }
    }
    var player =    players[name] || false;
    if ( !player ){
        msg( from, "I don't know who", name, "is." );
    } else if ( !player.lastLeave ){
        msg( from, "I haven't seen", name, "for a long time..." );
    } else {
        msg( from, "I have last seen", name, agoStr( player.lastLeave ));
    }
}///

function onPlayerJoin( pid, name ){

    pids[pid] =             name;

    if ( isUser( name ) && isUser( uc.info.name ) && pid !== uc.info.pid ){

        var player =        getPlayer( name );
        var messages =      getMessages( name );
        var pmessages =     getMessages( "@" );
        var hadIntro =      player.hadIntro;
        var lastRead =      player.lastRead || 0;
        var lastPublic =    player.lastPublic || 0;

        var delay =         0;

        if ( !hadIntro ){
            delay +=        MSGDELAY * 3;
            setTimeout(function(){
                msg( name, "Hi! I can get your messages to players when they come online" );
                msg( name, "To start using me type \"@mailbot help\"" );
                player.hadIntro =   true;
                saveData();
            }, delay );
        }

        delay +=            MSGDELAY * 2;
        setTimeout(function(){
            msg( name, "You have", messages.length - lastRead, "unread messages and", pmessages.length - lastPublic, "unread public messages." );
        }, delay );
    }
}///

function onPlayerLeave( pid ){

    if ( pids[pid] ){

        var player =        getPlayer( pids[pid] );
        player.lastLeave =  +new Date;
        saveData();
        pids[pid] =         false;
    }
}///

function onHelp( name ){

    msg( name, "Send private messages to use my commands:" );
    msg( name, " ls (list unread), la (list all private), lp (list all public)" );
    msg( name, " @user msgtext (send to user), @@ msgtext (send to all)" );
}///

function onConnect(){

    uc.send("P",2348.5,12.75,4143,3.3,0)
}///

/// Data layer: ----------------------------------------------------------------

function getMessages( to ){

    return messages[to] =  messages[to] || [];
}///

function getPlayer( name ){

    return players[name] =  players[name] || {};
}///

/// Persistence: ---------------------------------------------------------------

function saveData(){

    fs.writeFile( MESSAGES, JSON.stringify( messages ), ENCODING );
    fs.writeFile( PLAYERS, JSON.stringify( players ), ENCODING );
}///

function loadData( fileName ){

    try {
        return JSON.parse( fs.readFileSync( fileName, ENCODING ));
    } catch (e){
        console.error( fileName, e );
        return {};
    }
}///

/// Utilities ------------------------------------------------------------------

function agoStr( time ){

    var diff =  +new Date - time;

    if ( diff >  48*3600*1000 ){
        return "at " + (new Date( time )).toJSON().slice( 5, 16 );
    } else if ( diff > 7200 * 1000 ){
        return Math.floor( diff / 3600000 ) + " h ago";
    } else if ( diff > 60000 ){
        return Math.floor( diff / 60000 ) + " min. ago";
    } else {
        return Math.floor( diff / 1000 ) + " s ago";
    }
}///
