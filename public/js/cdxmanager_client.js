var socket = io(document.baseURI);
socket.on('connect', function(){
	socket.on('event', function(data){});
	socket.on('disconnect', function(){});
});