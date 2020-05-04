"use strict";
var Quadtree = require("quadtree-lib");
var http = require("http");
var express = require('express');

var app = express(); 
var server = http.createServer().listen(1234, "127.0.0.1");

     
// Buradan sonrasý yeni
var io = require("socket.io").listen(server);

//indirgeme fonksiyonumuz (Douglas peucker)
var simplifyPath = function (points, tolerance) {

    // helper classes 
    var Vector = function (x, y) {
        this.x = x;
        this.y = y;

    };
    var Line = function (p1, p2) {
        this.p1 = p1;
        this.p2 = p2;

        this.distanceToPoint = function (point) {
            // slope
            var m = (this.p2.y - this.p1.y) / (this.p2.x - this.p1.x),
                // y offset
                b = this.p1.y - (m * this.p1.x),
                d = [];
            // distance to the linear equation
            d.push(Math.abs(point.y - (m * point.x) - b) / Math.sqrt(Math.pow(m, 2) + 1));
            // distance to p1
            d.push(Math.sqrt(Math.pow((point.x - this.p1.x), 2) + Math.pow((point.y - this.p1.y), 2)));
            // distance to p2
            d.push(Math.sqrt(Math.pow((point.x - this.p2.x), 2) + Math.pow((point.y - this.p2.y), 2)));
            // return the smallest distance
            return d.sort(function (a, b) {
                return (a - b); //causes an array to be sorted numerically and ascending
            })[0];
        };
    };

    var douglasPeucker = function (points, tolerance) {
        if (points.length <= 2) {
            return [points[0]];
        }
        var returnPoints = [],
            // make line from start to end 
            line = new Line(points[0], points[points.length - 1]),
            // find the largest distance from intermediate poitns to this line
            maxDistance = 0,
            maxDistanceIndex = 0,
            p;
        for (var i = 1; i <= points.length - 2; i++) {
            var distance = line.distanceToPoint(points[i]);
            if (distance > maxDistance) {
                maxDistance = distance;
                maxDistanceIndex = i;
            }
        }
        // check if the max distance is greater than our tollerance allows 
        if (maxDistance >= tolerance) {
            p = points[maxDistanceIndex];
            line.distanceToPoint(p, true);
            // include this point in the output 
            returnPoints = returnPoints.concat(douglasPeucker(points.slice(0, maxDistanceIndex + 1), tolerance));
            // returnPoints.push( points[maxDistanceIndex] );
            returnPoints = returnPoints.concat(douglasPeucker(points.slice(maxDistanceIndex, points.length), tolerance));
        } else {
            // ditching this point
            p = points[maxDistanceIndex];
            line.distanceToPoint(p, true);
            returnPoints = [points[0]];
        }
        return returnPoints;
    };
    var arr = douglasPeucker(points, tolerance);
    // always have to push the very last point on so it doesn't get left off
    arr.push(points[points.length - 1]);
    return arr;

};


io.sockets.on('connection', function (socket) {

    var result;

    var quadtree = new Quadtree({
        width: 500,
        height: 500,
        maxElements: 100 //Optional
    })

    var lat, long;
    socket.on("Koordinatlar", function (data) {
        data.forEach(obj => {
            //console.log(typeof obj.lat); string dönüyor.
            lat = Number(obj.lat);
            long = Number(obj.lng);
            //console.log(typeof lat) number dönüyor.
            //x ve y number olduðu için çverime yaptýk.
            console.log("Lat : " + obj.lat + ", Long : " + obj.lng);

            quadtree.push({
                x: lat,      //Mandatory
                y: long,      //Mandatory
            }, true) //Optional, defaults to false

        })

    });

    var max_X, min_X, min_Y, max_Y;
    //Burda textboxlardan aldýðýmýz max ve min deðerlerini kullanýcaz.
    //0. eleman min deðer, 1. eleman max deðer. (dizide)
    socket.on("Sorgu", function (data) {
        //console.log(data[0]);
        //console.log(typeof data[0]); string türünde

        //console.log(data);
        min_X = Number(data[0]);
        //console.log(min); yazýyor sýkýntý yok.
        max_X = Number(data[1]);
        //console.log(typeof min);

        min_Y = Number(data[2]);
        max_Y = Number(data[3]);
        //Number'a çevirmemizin nedeni x ve y lerin quadtree de number formatta olmasý.
        
        var filtered = quadtree.filter(function (element) {
            return element.x < max_X

            //&& islemini kabul etmiyor! ARAÞTIR!!!   
            //max deðer 41.05 olunca çalýþýyor. yani kodda sýkýntý yok.

        });

        var sonuc = [];
        var i = 0;

        //dizi lat lng þeklinde gidiyor.
        var cenk2 = quadtree.each(function (element) {
            if (element.x < max_X && element.x > min_X) {
                if (element.y < max_Y && element.x > min_Y) {
                    sonuc[i] = element.x;
                    sonuc[i+1] = element.y;
                    //console.log(element.x);
                    i = i + 2; // o yüzden 2 arttýrdýk.
                }
            }

            // As with all iterative methods, modifying the quadtree or its contents is discouraged. //
        });

        //console.log(sonuc);

        console.log("*******Sorgu*********");
      
        var keys = ["lat", "lng"];

            result = sonuc.reduce(function (r, v, i) {
                if (i % keys.length === 0) {
                    r.push({});
                }
                r[r.length - 1][keys[i % keys.length]] = v;
                return r;
            }, []);

            console.log(result);
  
        console.log("***********************");

        socket.emit("test", result); //sorgu sonucunu istemciye gönderdik.
         
    });
   

    socket.on("Ham Veri", function (data) {

        var t0 = process.hrtime();

        var result = simplifyPath(data, 10); //Ýndirgeme iþlemi çalýþtýrýlýyor.

        var timeInMilliseconds = process.hrtime(t0)[1] / 1000000; //ms olarak dönüyor.

        console.log("Indirgeme islemi icin gecen sure : " + timeInMilliseconds + " ms");
        
        console.log("***********Result yazildi****************");
        console.log(result);
        
        var oran = (1 - (result.length / data.length)) * 100;
        //console.log(oran); 50 yazdý.
            
        socket.emit("Reduction", result);
        socket.emit("Ratio", oran);
        socket.emit("Sure", timeInMilliseconds);
       
    });


});



//kullanýcý baðlantýlarýný anlamak için bu kodu yazdýk.
io.sockets.on('connection', function (socket) {

    console.log("Kullanici baglandi.");

    socket.on("disconnect", function () {

        console.log("Kullanici cikti.");
    }); 
});