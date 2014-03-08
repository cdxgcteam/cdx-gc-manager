//START
(function(){

var pushFullTable = function(intable, tabledata) {
	//console.log('pushFullTable JSON:\n'+JSON.stringify(tabledata));
	for(var i=(tabledata.length-1); i >= 0; i--) {
		addNewRow(
			intable,
			tabledata[i].taskid,
			tabledata[i].url,
			tabledata[i].poc,
			tabledata[i].minWorkTime,
			tabledata[i].workTime,
			tabledata[i].taskCreateDate,
			tabledata[i].taskCreateMS,
			0
		);
	}
};

var addNewRow = function (tbodyStr, id, url, poc, minTime, workTime, submittedTime, submittedTimeMS, completedCount) {
	var tempStr = '#' + tbodyStr;
	var baseTable = $(tempStr);
	if (baseTable.length == 1) {

		// Create a new row:
		var newRow = baseTable[0].insertRow(0);

		cur_id = newRow.insertCell(0);
		cur_id.innerText = id;

		cur_url = newRow.insertCell(1);
		cur_url.innerHTML = '<a href="'+url+'" data-toggle="tooltip" data-placement="right" title="'+url+'">Link</a>';

		cur_poc = newRow.insertCell(2);
		cur_poc.innerText = poc;

		cur_min = newRow.insertCell(3);
		cur_min.innerText = minTime + ' ms';

		cur_time = newRow.insertCell(4);
		cur_time.innerText = workTime + ' ms';

		cur_submit = newRow.insertCell(5);
		cur_submit.innerText = submittedTime + '('+ submittedTimeMS +' ms)';

		cur_badge = newRow.insertCell(6);
		cur_badge.innerHTML = '<span class="badge">' + completedCount + '</span>';	
		
		// Add javascript additions:
		var turn_on_tooltip = 'tr:contains("'+id+'") a';
		$(turn_on_tooltip).tooltip();
		
		return 1;
	} else {
		return 0;
	}
};

// Socket Setup:
var socket = null;
var start_socket = function () {
	return $.Deferred(function (defer) {
		socket = io(document.location.origin);
		socket.on('connect', function(){
			console.log('sio :: connected');
			defer.resolve(true);
			socket.on('updateFullAllTasks', function(data){
				pushFullTable('tasks_tbody', data);
			});
			socket.on('updateFullMalicious', function(data){
				pushFullTable('mal_tbody', data);
			});
			socket.on('disconnect', function(){
				console.log('sio :: disconnected');
			});
		});
	}).promise();
};

// Main: Running start...
var runner = function () {

	// For the table pages:
	var table_exists = null;
	var table_type = '';
	if (document.location.pathname === '/'){ // Malicious Dashboard
		table_exists = $('document:has(#mal_tbody)');
		table_type = 'mal';		
	} else if (document.location.pathname === '/viewalltasks') {
		table_exists = $('document:has(#tasks_tbody)');
		table_type = 'alltasks';
	}

	if (!_.isNull(table_exists)){
		console.log('sio :: updateFullTable command sent');
		socket.emit('updateFullTable', table_type);
		
		setInterval(function () {
			socket.emit('updateTable', table_type);
		},5000);
	}

	// For the admin page:
	if (document.location.pathname === '/admin'){
		$('#clearSentOrder').submit(function () {
			console.log('Clearing sent order...');
			socket.emit('clearSentOrder');
		});
	
		$('#clearAllKeys').submit(function () {	
			console.log('Clearing all keys...');
			socket.emit('clearAllKeys');
		});
	}
};

$( document ).ready(function () {
	start_socket().then(runner);
	
});

//END
})();
