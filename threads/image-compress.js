const { Worker, isMainThread, parentPort, workerData, threadId } = require("worker_threads");
const jimp = require("jimp");

if(isMainThread) {
    module.exports = (img) => new Promise(async (resolve, reject) => {
        const worker = new Worker(__filename, { workerData: img });
        worker.on("message", resolve);
        worker.on("error", reject);
        worker.on("exit", (code) => {
            if(code != 0) {
                reject(new Error(`Worker stopped with code ${code}`));
            }
        })
    });
}
else {
    (async () => {
        const imgObj = await jimp.read(workerData);
        imgObj.scale(0.75)
            .quality(60)
            .write(workerData);
        parentPort.postMessage(workerData);
    })();
}