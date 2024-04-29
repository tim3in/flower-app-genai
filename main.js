$(function () {
    const video = $("video")[0];

    var model;
    var cameraMode = "environment"; // or "user"

    const API_KEY = 'CHATGPT_API_KEY';

    const startVideoStreamPromise = navigator.mediaDevices
        .getUserMedia({
            audio: false,
            video: {
                facingMode: cameraMode
            }
        })
        .then(function (stream) {
            return new Promise(function (resolve) {
                video.srcObject = stream;
                video.onloadeddata = function () {
                    video.play();
                    resolve();
                };
            });
        });

    var publishable_key = "ROFBOFLOW_API_KEY";
    var toLoad = {
        model: "flowers-ujm4o",
        version: 2
    };

    const loadModelPromise = new Promise(function (resolve, reject) {
        roboflow
            .auth({
                publishable_key: publishable_key
            })
            .load(toLoad)
            .then(function (m) {
                model = m;
                resolve();
            });
    });

    Promise.all([startVideoStreamPromise, loadModelPromise]).then(function () {
        $("body").removeClass("loading");
        resizeCanvas();
        detectFrame();
    });

    var canvas, ctx;
    const font = "16px sans-serif";

    function videoDimensions(video) {
        // Ratio of the video's intrinsic dimensions
        var videoRatio = video.videoWidth / video.videoHeight;

        // The width and height of the video element
        var width = video.offsetWidth,
            height = video.offsetHeight;

        // The ratio of the element's width to its height
        var elementRatio = width / height;

        // If the video element is short and wide
        if (elementRatio > videoRatio) {
            width = height * videoRatio;
        } else {
            // It must be tall and thin, or exactly equal to the original ratio
            height = width / videoRatio;
        }

        return {
            width: width,
            height: height
        };
    }

    $(window).resize(function () {
        resizeCanvas();
    });

    const resizeCanvas = function () {
        $("canvas").remove();

        canvas = $("<canvas/>");

        ctx = canvas[0].getContext("2d");

        var dimensions = videoDimensions(video);

        console.log(
            video.videoWidth,
            video.videoHeight,
            video.offsetWidth,
            video.offsetHeight,
            dimensions
        );

        canvas[0].width = video.videoWidth;
        canvas[0].height = video.videoHeight;

        canvas.css({
            width: dimensions.width,
            height: dimensions.height,
            left: ($(window).width() - dimensions.width) / 2,
            top: ($(window).height() - dimensions.height) / 2
        });

        $("body").append(canvas);

        // Add button to display object information
        const button = $("<button/>")
            .attr("id", "btnobj")
            .text("Show Flower Info")
            .css({
                position: "absolute",
                top: "20px",
                //left: "20px"
            })
            .click(function () {
                const predictions = getCurrentPredictions();
                displayObjectInfo(predictions);
            });

        $("body").append(button);
    };

    const getCurrentPredictions = function () {
        return model ? model.detect(video) : Promise.resolve([]);
    };

    const displayObjectInfo = function (predictions) {
        predictions.then(async function (predictions) {
            if (predictions.length > 0) {
                // Select the object with the highest confidence score
                const object = predictions.reduce((prev, current) => (prev.score > current.score) ? prev : current);
    
                const objectName = object.class;
    
                const text = "What is " + objectName + "? Give botanical information.";
    
                // Remove previous text area if exists
                $("#objectInfo").remove();
    
                // Create a text area to display object information
                const textArea = $("<textarea/>")
                    .attr("id", "objectInfo")
                    .css({
                        position: "absolute",
                        width: "100%",
                        height: "100%",
                        backgroundColor: "rgba(0, 0, 0, 0.9)", 
                        color: "white", 
                        border: "2px solid white",
                        borderRadius: "5px",
                        resize: "none",
                        top: "80px",
                        padding: "10px", 
                        boxSizing: "border-box",
                        overflow: "auto"
                    });
    
                // Call GPT-3.5 chat completion API
                try {
                    const response = await fetch('https://api.openai.com/v1/chat/completions', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${API_KEY}`,
                        },
                        body: JSON.stringify({
                            model: 'gpt-3.5-turbo',
                            messages: [{ role: 'user', content: text }],
                            temperature: 1.0,
                            top_p: 0.7,
                            n: 1,
                            stream: false,
                            presence_penalty: 0,
                            frequency_penalty: 0,
                        }),
                    });
    
                    if (response.ok) {
                        const data = await response.json();
                        const completion = data.choices[0].message.content;
                        textArea.text(completion);
                        $("body").append(textArea);
                    } else {
                        console.error('Error: Unable to process your request.');
                    }
                } catch (error) {
                    console.error(error);
                    console.error('Error: Unable to process your request.');
                }
            } else {
                console.log("No object detected");
            }
        });
    };
 
    var prevTime;
    var pastFrameTimes = [];
    const detectFrame = function () {
        if (!model) return requestAnimationFrame(detectFrame);

        getCurrentPredictions().then(function (predictions) {
            requestAnimationFrame(detectFrame);
            renderPredictions(predictions);

            if (prevTime) {
                pastFrameTimes.push(Date.now() - prevTime);
                if (pastFrameTimes.length > 30) pastFrameTimes.shift();

                var total = 0;
                pastFrameTimes.forEach(function (t) {
                    total += t / 1000;
                });

                var fps = pastFrameTimes.length / total;
                $("#fps").text(Math.round(fps));
            }
            prevTime = Date.now();
        });
    };

    const renderPredictions = function (predictions) {
        var dimensions = videoDimensions(video);

        var scale = 1;

        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;

            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Draw the bounding box.
            ctx.strokeStyle = prediction.color;
            ctx.lineWidth = 4;
            ctx.strokeRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                width / scale,
                height / scale
            );

            // Draw the label background.
            ctx.fillStyle = prediction.color;
            const textWidth = ctx.measureText(prediction.class).width;
            const textHeight = parseInt(font, 10); // base 10
            ctx.fillRect(
                (x - width / 2) / scale,
                (y - height / 2) / scale,
                textWidth + 8,
                textHeight + 4
            );
        });

        predictions.forEach(function (prediction) {
            const x = prediction.bbox.x;
            const y = prediction.bbox.y;

            const width = prediction.bbox.width;
            const height = prediction.bbox.height;

            // Draw the text last to ensure it's on top.
            ctx.font = font;
            ctx.textBaseline = "top";
            ctx.fillStyle = "#000000";
            ctx.fillText(
                prediction.class,
                (x - width / 2) / scale + 4,
                (y - height / 2) / scale + 1
            );
        });
    };
});
