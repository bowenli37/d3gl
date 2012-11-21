// Jiwon Kim and Dan Posch
// {jiwonk, dcposch}@cs.stanford.edu
// CS448B Final Project

// See README.md for examples.


// check prerequisites 
if(!d3 || !jQuery || !THREE || !requestAnimationFrame){
    throw "D3GL requires D3, JQuery, ThreeJS, and RequestAnimationFrame";
}

d3.gl = {};
d3.gl.globe = function(){
    // PUBLIC PROPERTIES
    // viewport dimensions, in pixels
    var width = 400;
    var height = 400;
    // texture name
    var texture = '../img/earth-tex.png';
    // callbacks. data => lat, lon, etc
    var fnLat, fnLon, fnTex;

    //TODO: clean
    var fnChoropleth = true;
    var fnCircles = false;

    // PRIVATE VARS
    var zoom = 2.0, rotation = [0, 0]; // azith, angle
	// constants
	var VIEW_ANGLE = 45,
	    NEAR = 0.01,
	    FAR = 100;
    var MOUSE_SENSITIVITY = [0.005, 0.005];
    var ZOOM_SENSITIVITY = 0.1; // (0 = no effect, 1 = infinite)
    var MIN_ZOOM = 0.5, MAX_ZOOM = 2;
    var COUNTRY_CODE_TEX = "../img/country-codes.png";

    var colorOverlayUtils = {
        loadShaders: function(callback) {
            $.get("../shaders/color_overlay_fs.glsl", function(fs) {
                $.get("../shaders/color_overlay_vs.glsl", function(vs) {
                    overlayFs = fs;
                    overlayVs = vs;
                    console.log(fs);
                    console.log(vs);
                    callback();
                });
            });
        },
        createMaterial: function(bgTexture, overlayTexture, additionalUniforms) {
            var vertexShader = overlayVs;
            var fragmentShader = overlayFs;
            var uniforms = {
                texture: {
                    type: "t",
                    value: THREE.ImageUtils.loadTexture(bgTexture)
                },
                overlay: {
                    type: "t",
                    value: overlayTexture
                },
            };
            $.extend(true, uniforms, additionalUniforms);
            console.log(uniforms);
            var material = new THREE.ShaderMaterial({
                vertexShader: vertexShader,
                fragmentShader: fragmentShader,
                uniforms: uniforms,
            });

            return material;
        },
    };

    var circlesUtils = {
        createCirclesTexture: function() {
            // create hidden canvas element for image pixel manipulation
            var canvas = document.createElement("canvas");
            canvas.width = 4000;
            canvas.height = 2000;
            var context = canvas.getContext("2d"); 

            // fake data
            var data = [
                {lat: 37.5833, lon: 127.0000, color: "#f00", radius: 10}, // seoul
                {lat: 37.7750, lon: -122.4183, color: "#0f0", radius: 5}, // sf
                {lat: 40.7142, lon: -74.0064, color: "#00f", radius: 20}, // ny
                {lat: 31.2000, lon: 121.5000, color: "#ff0", radius: 15} // shanghai
            ];

            // fake color function
            var colorfn = function(d) {
                return d.color;
            };

            // fake radius function
            var radiusfn = function(d) {
                return d.radius;
            };
            
            // fake lat lon functions
            var latfn = function(d) {
                return d.lat;
            };

            var lonfn = function(d) {
                return d.lon;
            };

            for (var i=0; i<data.length; i++) {
                var d = data[i];

                var lat = latfn(d);
                var lon = lonfn(d);
                var color = colorfn(d);
                var radius = radiusfn(d); // radius in pixels

                var plat = canvas.height - Math.floor(canvas.height * (lat + 90)/180);
                var plon = Math.floor(canvas.width * (lon + 180)/360);

                context.beginPath();
                context.arc(plon, plat, radius, 0, 2*Math.PI, false);
                context.lineWidth = 3;
                context.strokeStyle = '#fff';
                context.stroke();
                context.fillStyle = color;
                context.fill();
            }

            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        },
        createMaterial: function(tex) {
            var material = colorOverlayUtils.createMaterial(
                tex,
                this.createCirclesTexture(),
                {}
            );
            this.uniforms = material.uniforms;
            return material;
        },
    };

    var choroplethUtils = {
        loadCountryCodeTexture: function(callback) {
            var codes = new Image();
            codes.onload = callback;
            codes.src = COUNTRY_CODE_TEX;
        },
        countryCodeFromColor: function(r, g, b) {
            return r*255*255 + g*255 + b;
        },
        colorOverlayFromCountryCode: function(code) {
            if(code==840) return {r: 255, g: 0, b: 0};
            return {r: 0, g: 0, b: 0};
        },
        highlightCountryAt: function(lat, lon) {
            var x, y;
            x = Math.floor(this.codes.width * (lon + 180)/360);
            y = this.codes.height - 
                Math.floor(this.codes.height * (lat + 90)/180);
            
            var idx, r, g, b;
            idx = (y*this.codes.width + x)*4;
            r = this.codesImageData.data[idx];
            g = this.codesImageData.data[idx + 1];
            b = this.codesImageData.data[idx + 2];

            var countryCode = this.countryCodeFromColor(r, g, b);
            this.uniforms.country.value = countryCode;
            console.log("highlighting "+countryCode);
            console.log("color: ("+r+","+g+","+b+")");
        },
        storeCountryCodesImageData: function(context, pixels) {
            context.putImageData(pixels, 0, 0);
            choroplethUtils.codesImageData = context.getImageData(
                0, 0, choroplethUtils.codes.width, choroplethUtils.codes.height);
        },
        createChoroplethTexture: function() {
            // create hidden canvas element for image pixel manipulation
            var canvas = document.createElement("canvas");
            canvas.width = this.codes.width;
            canvas.height = this.codes.height;

            var context = canvas.getContext("2d"); 
            context.drawImage(this.codes, 0, 0);
            var pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            this.storeCountryCodesImageData(context, pixels);

            for (var y=0; y<canvas.height; y++) {
                for(var x=0; x<canvas.width; x++) {
                    var r, g, b, a;
                    var idx = (y*canvas.width + x)*4;

                    r = pixels.data[idx];
                    g = pixels.data[idx + 1];
                    b = pixels.data[idx + 2];
                    var countryCode = this.countryCodeFromColor(r, g, b);
                    var colorOverlay = this.colorOverlayFromCountryCode(countryCode);
                    pixels.data[idx] = colorOverlay.r;
                    pixels.data[idx + 1] = colorOverlay.g;
                    pixels.data[idx + 2] = colorOverlay.b;
                }
            }

            context.putImageData(pixels, 0, 0);

            var texture = new THREE.Texture(canvas);
            texture.needsUpdate = true;
            return texture;
        },
        createMaterial: function(tex) {
            var material = colorOverlayUtils.createMaterial(
                tex,
                this.createChoroplethTexture(),
                {
                    codes: {
                        type: "t",
                        value: THREE.ImageUtils.loadTexture(this.codes.src)
                    },
                    country: {
                        type: "i",
                        value: 0
                    },
                }
            );
            this.uniforms = material.uniforms;
            return material;
        },
    }

    // sets up a ThreeJS globe
    function initGL(gl, tex){
        var scene = new THREE.Scene();

        // camera
        var camera = new THREE.PerspectiveCamera(
            VIEW_ANGLE, width/height,
            NEAR, FAR);
        camera.position.z = 2;
        scene.add(camera);

        // globe model
        var sphereMaterial;
        if(fnChoropleth) {
            sphereMaterial = choroplethUtils.createMaterial(tex);
        } else if(fnCircles) {
            sphereMaterial = circlesUtils.createMaterial(tex);
        } else {
            var texture = THREE.ImageUtils.loadTexture(tex);
            sphereMaterial = new THREE.MeshLambertMaterial({
                color: 0xffffff,
                map: texture
            });
        }

        var radius = 1.0, segments = 80, rings = 40;
        var sphere = new THREE.Mesh(
           new THREE.SphereGeometry(radius, segments, rings),
           sphereMaterial);
        scene.add(sphere);
                
        // add a point light
        var pointLight = new THREE.PointLight( 0xFFFFFF );
        pointLight.position.x = 1;
        pointLight.position.y = 5;
        pointLight.position.z = 13;
        scene.add(pointLight);

        // start the renderer
        var renderer = new THREE.WebGLRenderer({
            antialias: true
        });
        renderer.setSize(width, height);

        gl.mesh = sphere;
        gl.renderer = renderer;
        gl.scene = scene;
        gl.camera = camera;
        gl.projector = new THREE.Projector();
    }

    function initControls(gl, elem){
        var dragStart;
        $(elem).mousedown(function(evt){
            evt.preventDefault();
            dragStart = [evt.pageX, evt.pageY];
            select(evt);
        }).mousemove(function(evt){
            if(!dragStart) return;
            update(evt);
            dragStart = [evt.pageX, evt.pageY];
        }).mouseup(function(evt){
            if(!dragStart) return;
            update(evt);
            dragStart = null;
        }).mousewheel(function(evt, delta, dx, dy){
            zoom *= Math.pow(1-ZOOM_SENSITIVITY, dy);
            zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
            evt.preventDefault();
        });

        function select(evt) {
            // currently, only support selection for choropleth mode
            if(!fnChoropleth) return;

            // cast a ray through the mouse
            var vector = new THREE.Vector3(
                (evt.offsetX / width)*2 - 1,
                -(evt.offsetY / height)*2 + 1,
                1.0
            );
            gl.projector.unprojectVector(vector, gl.camera);
            var ray = new THREE.Ray(
                gl.camera.position,
                vector.subSelf(gl.camera.position).normalize()
            );

            // ray-sphere intersection for unit sphere centered at (0, 0, 0)
            var a = ray.direction.dot(ray.direction);
            var b = 2 * ray.origin.dot(ray.direction)
            var c = ray.origin.dot(ray.origin) - 1;
            var det = b*b - 4*a*c;
            if(det < 0) return; // no intersection
            var t = (-b - Math.sqrt(det))/(2*a);
            var point = ray.direction.clone().multiplyScalar(t).addSelf(ray.origin);

            // convert to lat/lon
            var lat = Math.asin(point.y) + rotation[0];
            var lon = Math.atan2(point.x, point.z) - rotation[1];
            lat = 180/Math.PI*lat;
            lon = 180/Math.PI*lon - 90;
            while(lon < -180) lon += 360;
            while(lon > 180) lon -= 360;
            while(lat < -90) lat += 360;
            while(lat > 270) lat -= 360;
            if(lat > 90) lat = 90 - lat;
            
            choroplethUtils.highlightCountryAt(lat, lon);
        }

        function update(evt){
            rotation[1] += (evt.pageX - dragStart[0])*MOUSE_SENSITIVITY[0]*zoom;
            rotation[0] += (evt.pageY - dragStart[1])*MOUSE_SENSITIVITY[1]*zoom;
        }
    }

    // This is not quite as clean as
    // an external stylesheet, but simpler for
    // the end user.
    function initStyle(elem){
        elem.style.cursor = "pointer";
    }

    // renders. see http://bost.ocks.org/mike/chart/
    function globe(g){
        // render into each canvas
        g.each(function(d,i){
            var element = this;
            if(element.tagName == "canvas") throw "D3GL can only render into Canvas elements";
            var texture = fnTex(d);
            console.log("Rendering. "+
                "Dimensions: "+width+","+height+" "+
                "Texture: "+texture);

            function start() {
                // 3js state
                var gl = {};
                initGL(gl, texture);
                initControls(gl, gl.renderer.domElement);
                initStyle(gl.renderer.domElement);
                element.appendChild(gl.renderer.domElement);
                
                // called 60 times per second
                function render(){
                    gl.mesh.rotation.x = rotation[0];
                    gl.mesh.rotation.y = rotation[1];
                    gl.camera.position.z = 1+zoom;
                    gl.renderer.render(gl.scene, gl.camera);
                    requestAnimationFrame(render);
                }
                render();
            }

            colorOverlayUtils.loadShaders(function() {
                choroplethUtils.loadCountryCodeTexture(function(ev) {
                    choroplethUtils.codes = ev.target;
                    start();
                });
            });
        });
    }
    globe.width = function(val){
        if(!arguments.length) return width;
        width = val;
        return globe;
    }
    globe.height = function(val){
        if(!arguments.length) return height;
        height = val;
        return globe;
    }
    globe.latitude= function(val){
        if(!arguments.length) return fnLat;  
        if(typeof val === "function") fnLat = val;
        else fnLat = function(){return val;}
        return globe;
    }
    globe.longitude= function(val){
        if(!arguments.length) return fnLon;  
        if(typeof val === "function") fnLon = val;
        else fnLon = function(){return val;}
        return globe;
    }
    globe.texture = function(val){
        if(!arguments.length) return texture;  
        if(typeof val === "function") fnTex = val;
        else fnTex = function(){return val;}
        return globe;
    }
    return globe;
};
