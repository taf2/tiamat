Worker = require(__dirname + "/../lib/worker.js").Worker;

var worker = new Worker();

if (worker.child()) {
  worker.on("message", function(data) {
    console.log("message from parent: " + data);
    worker.postMessage("hello parent");
  });

  worker.postMessage("hello parent");
}
else {

  worker.on("message", function(data) {
    console.log("message from child: " + data);
  });

  worker.postMessage("hello child");

  worker.exit();
}
