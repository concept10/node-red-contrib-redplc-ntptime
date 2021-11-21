/**
 * Copyright 2021 Ocean (iot.redplc@gmail.com).
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 **/

module.exports = function(RED) {
	"use strict";

    const dgram = require('dgram');
	const syslib = require('./lib/syslib.js');

	RED.nodes.registerType("ntptime", function(n) {
		var node = this;
		RED.nodes.createNode(node, n);

		node.tagnameai = "IA" + n.addressai;
		node.tupdate = n.tupdate;
        node.ntpserver = n.ntpserver;
		node.ampm = n.ampm;
		node.systime = n.systime;
		node.iserror = false;
		node.setai = false;
		node.onWork = false;
		node.ntpclient = dgram.createSocket("udp4");
		node.ntpData = new Buffer.alloc(48);
		node.ntpData[0] = 0x1B;

		node.store = node.context().global;

		function setDateTime(dt) {
			var hr = dt.getHours();
			var ap = (hr >= 12) ? 1 : 0;
			var hr = (node.ampm) ? hr % 12 : hr;
			node.store.set(node.tagnameai, [dt.getSeconds(), dt.getMinutes(), hr, ap, dt.getDay(), dt.getDate(), dt.getMonth() + 1, dt.getFullYear()]);
		}

		node.ntpclient.on('message', function (data) {
			clearTimeout(node.id_sendtimeout);

			var part1 = 0, part2 = 0;

			for (var i = 0; i <= 3; i++) {
				part1 = 256 * part1 + data[40 + i];
			}

			for (i = 4; i <= 7; i++) {
				part2 = 256 * part2 + data[40 + i];
			}

			var date = new Date("Jan 01 1900 GMT");

			date.setUTCMilliseconds(date.getUTCMilliseconds() + (part1 * 1000 + (part2 * 1000) / 0x100000000));
			setDateTime(date);
			syslib.setStatus(node, node.tagnameai + " - " + node.ntpserver);
			node.onWork = false;
		});

		function updateDateTime()
		{
			if (node.onWork || node.iserror)
				return;
			
			node.onWork = true;

            for (var i = 1; i < 48; i++)
                node.ntpData[i] = 0;

            node.ntpclient.send(node.ntpData, 0, node.ntpData.length, 123, node.ntpserver, function (err) {
                if (err) {
					if (node.systime) {
						setDateTime(new Date());
						syslib.setStatus(node, node.tagnameai + " - System-Time");
					}
					else
						syslib.outError(node, "server failure", "server failure");

					node.onWork = false;
					return;
				}

                node.id_sendtimeout = setTimeout(function () {
					if (node.systime) {
						setDateTime(new Date());
						syslib.setStatus(node, node.tagnameai + " - System-Time");
					}
					else
						syslib.outError(node, "server failure", "server failure");

					node.onWork = false;
	            }, 5000);
            });
		}

		node.statustxt = "";

		if (node.store.keys().find(key => key === node.tagnameai) !== undefined)
			node.iserror = syslib.outError(node, "duplicate " + node.tagnameai, "duplicate address " + node.tagnameai);
		else {
			setDateTime(new Date());
			node.setai = true;
		}

		node.id_loop = setInterval(updateDateTime, node.tupdate);

		node.on("input", function (msg) {
			if (typeof msg.payload !== "string")
				return;
			
			node.ntpserver = msg.payload;
		});

		node.on('close', function () {
			clearTimeout(node.id_sendtimeout);
			clearInterval(node.id_loop);
			node.ntpclient.close();
			if (node.setai)
				node.store.set(node.tagnameai, undefined);
		});
	});
}
