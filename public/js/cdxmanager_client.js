//START
(function(){

var socket = io(document.baseURI);
socket.on('connect', function(){
	socket.on('updateMalicious', function(data){
		console.log('Blobs JSON:\n'+JSON.stringify(data));
		for(var i=(data.length-1); i > 0; i--) {
			addNewRow(
				'mal_tbody',
				data[i].taskid,
				data[i].url,
				'dyap',
				'500' + ' ms',
				data[i].workTime + ' ms',
				data[i].taskCreateDate,
				0
			);
		}
	});
	socket.on('disconnect', function(){
		console.log('sio :: disconnected');
	});
});

var addNewRow = function (tbodyStr, id, url, poc, minTime, timeActual, submittedTime, completedCount) {
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
		cur_min.innerText = minTime;

		cur_time = newRow.insertCell(4);
		cur_time.innerText = timeActual;

		cur_submit = newRow.insertCell(5);
		cur_submit.innerText = submittedTime;

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

var runner = function () {

	var table_exists = null;
	var table_type = '';
	if (document.location.pathname === '/'){ // Malicious Dashboard
		table_exists = $('document:has(#mal_tbody)');
		table_type = 'mal';		
	} else if (document.location.pathname === '/viewalltasks') {
		table_exists = $('document:has(#tasks_tbody)');
		table_type = 'all';
	}

	if (!_.isNull(table_exists)){
		socket.emit('updateTable', table_type);
		// setInterval(function () {
		// 	
		// }, 5000); // Update every 5 seconds.
	}

	
	
};

$( document ).ready(function () {
	runner();
});

//END
})();
