#!/usr/bin/env python3
"""
Advanced Raspberry Pi Camera Server
Enhanced camera streaming with controls, recording, gallery, and more.
Compatible with Raspberry Pi 4B running Trixie with Camera V2.
"""

import io
import os
import json
import logging
import socket
import threading
import time
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from urllib.parse import urlparse, parse_qs
from pathlib import Path

try:
    from picamera2 import Picamera2
    from picamera2.encoders import H264Encoder
    from picamera2.outputs import FileOutput
    PICAMERA_AVAILABLE = True
except ImportError:
    PICAMERA_AVAILABLE = False
    print("⚠️  picamera2 not available - running in demo mode")

# Configuration
SERVER_PORT = 8080
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
FRAME_RATE = 30

# Paths
BASE_DIR = Path(__file__).parent
STATIC_DIR = BASE_DIR / "static"
CAPTURES_DIR = BASE_DIR / "captures"
CAPTURES_DIR.mkdir(exist_ok=True)

# Logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class CameraController:
    """Manages camera settings and operations."""
    
    def __init__(self):
        self.picam2 = None
        self.is_recording = False
        self.recording_file = None
        self.encoder = None
        self.start_time = time.time()
        self.frame_count = 0
        self.viewers = 0
        
        # Camera settings with defaults
        self.settings = {
            "brightness": 0.0,      # -1.0 to 1.0
            "contrast": 1.0,        # 0.0 to 2.0
            "saturation": 1.0,      # 0.0 to 2.0
            "sharpness": 1.0,       # 0.0 to 2.0
            "exposure_time": 0,     # 0 = auto
            "analogue_gain": 0,     # 0 = auto
            "awb_mode": "auto",
            "resolution": f"{FRAME_WIDTH}x{FRAME_HEIGHT}",
            "zoom": 1.0             # 1.0 to 4.0
        }
        
        self.awb_modes = ["auto", "incandescent", "tungsten", "fluorescent", 
                         "indoor", "daylight", "cloudy"]
        self.resolutions = ["640x480", "1280x720", "1920x1080"]
        
        if PICAMERA_AVAILABLE:
            self._init_camera()
    
    def _init_camera(self):
        """Initialize the camera."""
        try:
            self.picam2 = Picamera2()
            config = self.picam2.create_still_configuration(
                main={"size": (FRAME_WIDTH, FRAME_HEIGHT)}
            )
            self.picam2.configure(config)
            self.picam2.start()
            logger.info("Camera initialized successfully")
        except Exception as e:
            logger.error(f"Failed to initialize camera: {e}")
            self.picam2 = None
    
    def get_settings(self):
        """Get current camera settings."""
        return {
            **self.settings,
            "awb_modes": self.awb_modes,
            "resolutions": self.resolutions,
            "is_recording": self.is_recording
        }
    
    def update_settings(self, new_settings):
        """Update camera settings."""
        for key, value in new_settings.items():
            if key in self.settings:
                self.settings[key] = value
        
        if self.picam2 and PICAMERA_AVAILABLE:
            try:
                controls = {}
                if "brightness" in new_settings:
                    controls["Brightness"] = float(new_settings["brightness"])
                if "contrast" in new_settings:
                    controls["Contrast"] = float(new_settings["contrast"])
                if "saturation" in new_settings:
                    controls["Saturation"] = float(new_settings["saturation"])
                if "sharpness" in new_settings:
                    controls["Sharpness"] = float(new_settings["sharpness"])
                
                if controls:
                    self.picam2.set_controls(controls)
            except Exception as e:
                logger.error(f"Failed to update camera controls: {e}")
        
        return self.settings
    
    def capture_snapshot(self):
        """Capture and save a snapshot."""
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"snapshot_{timestamp}.jpg"
        filepath = CAPTURES_DIR / filename
        
        if self.picam2 and PICAMERA_AVAILABLE:
            try:
                self.picam2.capture_file(str(filepath))
                logger.info(f"Snapshot saved: {filename}")
                return {"success": True, "filename": filename}
            except Exception as e:
                logger.error(f"Snapshot failed: {e}")
                return {"success": False, "error": str(e)}
        else:
            # Demo mode - create placeholder
            return {"success": False, "error": "Camera not available"}
    
    def start_recording(self):
        """Start video recording."""
        if self.is_recording:
            return {"success": False, "error": "Already recording"}
        
        timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"recording_{timestamp}.h264"
        filepath = CAPTURES_DIR / filename
        
        if self.picam2 and PICAMERA_AVAILABLE:
            try:
                self.encoder = H264Encoder()
                self.picam2.start_recording(self.encoder, str(filepath))
                self.is_recording = True
                self.recording_file = filename
                logger.info(f"Recording started: {filename}")
                return {"success": True, "filename": filename}
            except Exception as e:
                logger.error(f"Recording failed: {e}")
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Camera not available"}
    
    def stop_recording(self):
        """Stop video recording."""
        if not self.is_recording:
            return {"success": False, "error": "Not recording"}
        
        if self.picam2 and PICAMERA_AVAILABLE:
            try:
                self.picam2.stop_recording()
                self.is_recording = False
                filename = self.recording_file
                self.recording_file = None
                logger.info(f"Recording stopped: {filename}")
                return {"success": True, "filename": filename}
            except Exception as e:
                logger.error(f"Stop recording failed: {e}")
                return {"success": False, "error": str(e)}
        return {"success": False, "error": "Camera not available"}
    
    def get_gallery(self):
        """Get list of captured files."""
        files = []
        for f in CAPTURES_DIR.iterdir():
            if f.suffix.lower() in ['.jpg', '.jpeg', '.png', '.h264', '.mp4']:
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "type": "image" if f.suffix.lower() in ['.jpg', '.jpeg', '.png'] else "video",
                    "size": stat.st_size,
                    "created": datetime.datetime.fromtimestamp(stat.st_ctime).isoformat()
                })
        return sorted(files, key=lambda x: x["created"], reverse=True)
    
    def delete_file(self, filename):
        """Delete a captured file."""
        filepath = CAPTURES_DIR / filename
        if filepath.exists() and filepath.parent == CAPTURES_DIR:
            filepath.unlink()
            return {"success": True}
        return {"success": False, "error": "File not found"}
    
    def get_stats(self):
        """Get server statistics."""
        uptime = int(time.time() - self.start_time)
        hours, remainder = divmod(uptime, 3600)
        minutes, seconds = divmod(remainder, 60)
        
        return {
            "uptime": f"{hours:02d}:{minutes:02d}:{seconds:02d}",
            "uptime_seconds": uptime,
            "frame_count": self.frame_count,
            "viewers": self.viewers,
            "is_recording": self.is_recording,
            "captures_count": len(list(CAPTURES_DIR.iterdir())),
            "camera_available": self.picam2 is not None
        }
    
    def cleanup(self):
        """Cleanup camera resources."""
        if self.is_recording:
            self.stop_recording()
        if self.picam2:
            self.picam2.stop()
            self.picam2.close()


class StreamingOutput:
    """Thread-safe output buffer for camera frames."""
    
    def __init__(self):
        self.frame = None
        self.condition = threading.Condition()

    def update_frame(self, buf):
        """Updates the current frame and notifies listeners."""
        with self.condition:
            self.frame = buf
            self.condition.notify_all()


# Global instances
camera = CameraController()
output = StreamingOutput()


def capture_loop():
    """Continuously captures complete JPEG frames."""
    logger.info("Starting capture loop...")
    stream = io.BytesIO()
    
    while True:
        try:
            if camera.picam2 and PICAMERA_AVAILABLE:
                stream.seek(0)
                stream.truncate()
                camera.picam2.capture_file(stream, format='jpeg')
                output.update_frame(stream.getvalue())
                camera.frame_count += 1
            else:
                # Demo mode - just sleep
                time.sleep(0.1)
        except Exception as e:
            logger.error(f"Capture error: {e}")
            time.sleep(1)


class AdvancedCameraHandler(BaseHTTPRequestHandler):
    """HTTP request handler for advanced camera server."""

    def log_message(self, format, *args):
        pass  # Reduce log spam

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        # Static files
        if path == '/' or path == '/index.html':
            self.serve_static_file('index.html', 'text/html')
        elif path.startswith('/css/'):
            self.serve_static_file(path[1:], 'text/css')
        elif path.startswith('/js/'):
            self.serve_static_file(path[1:], 'application/javascript')
        
        # Streaming
        elif path == '/stream.mjpg':
            self.send_mjpeg_stream()
        
        # API endpoints
        elif path == '/api/controls':
            self.send_json(camera.get_settings())
        elif path == '/api/stats':
            self.send_json(camera.get_stats())
        elif path == '/api/gallery':
            self.send_json(camera.get_gallery())
        elif path.startswith('/api/gallery/'):
            filename = path.split('/')[-1]
            self.serve_capture(filename)
        elif path == '/snapshot.jpg':
            self.send_snapshot()
        else:
            self.send_error(404, 'Not Found')

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length) if content_length else b'{}'
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {}
        
        if path == '/api/controls':
            result = camera.update_settings(data)
            self.send_json(result)
        elif path == '/api/snapshot':
            result = camera.capture_snapshot()
            self.send_json(result)
        elif path == '/api/recording/start':
            result = camera.start_recording()
            self.send_json(result)
        elif path == '/api/recording/stop':
            result = camera.stop_recording()
            self.send_json(result)
        else:
            self.send_error(404, 'Not Found')

    def do_DELETE(self):
        parsed = urlparse(self.path)
        path = parsed.path
        
        if path.startswith('/api/gallery/'):
            filename = path.split('/')[-1]
            result = camera.delete_file(filename)
            self.send_json(result)
        else:
            self.send_error(404, 'Not Found')

    def serve_static_file(self, filepath, content_type):
        """Serve a static file."""
        # Handle both relative and absolute paths
        if filepath.startswith('/'):
            filepath = filepath[1:]
        full_path = STATIC_DIR / filepath
        if full_path.exists():
            content = full_path.read_bytes()
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, 'File not found')

    def serve_capture(self, filename):
        """Serve a captured file."""
        filepath = CAPTURES_DIR / filename
        if filepath.exists() and filepath.parent == CAPTURES_DIR:
            content = filepath.read_bytes()
            content_type = 'image/jpeg' if filename.endswith('.jpg') else 'video/mp4'
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', len(content))
            self.end_headers()
            self.wfile.write(content)
        else:
            self.send_error(404, 'File not found')

    def send_json(self, data):
        """Send JSON response."""
        content = json.dumps(data).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(content))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(content)

    def send_mjpeg_stream(self):
        """Stream MJPEG video."""
        camera.viewers += 1
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
        self.send_header('Cache-Control', 'no-cache, private')
        self.send_header('Pragma', 'no-cache')
        self.end_headers()

        try:
            while True:
                with output.condition:
                    if not output.condition.wait(timeout=5.0):
                        continue
                    frame = output.frame
                
                if frame:
                    self.wfile.write(b'--FRAME\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n')
                    self.wfile.write(f'Content-Length: {len(frame)}\r\n\r\n'.encode())
                    self.wfile.write(frame)
                    self.wfile.write(b'\r\n')
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            pass
        except Exception as e:
            logger.debug(f"Stream ended: {e}")
        finally:
            camera.viewers -= 1

    def send_snapshot(self):
        """Send current frame as snapshot."""
        with output.condition:
            output.condition.wait(timeout=5.0)
            frame = output.frame
        
        if frame:
            self.send_response(200)
            self.send_header('Content-Type', 'image/jpeg')
            self.send_header('Content-Length', len(frame))
            self.end_headers()
            self.wfile.write(frame)
        else:
            self.send_error(500, 'No frame available')


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTP server that handles each request in a new thread."""
    allow_reuse_address = True
    daemon_threads = True


def get_ip_address():
    """Get the IP address of this device."""
    try:
        import netifaces
        preferred = ['wlan0', 'eth0', 'en0', 'wlan1']
        interfaces = netifaces.interfaces()
        
        for iface in preferred:
            if iface in interfaces:
                addrs = netifaces.ifaddresses(iface)
                if netifaces.AF_INET in addrs:
                    ip = addrs[netifaces.AF_INET][0].get('addr')
                    if ip and not ip.startswith('127.'):
                        return ip
        
        for iface in interfaces:
            if iface == 'lo':
                continue
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                ip = addrs[netifaces.AF_INET][0].get('addr')
                if ip and not ip.startswith('127.'):
                    return ip
    except:
        pass
    
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except:
        return "localhost"


def main():
    logger.info("Starting Advanced Camera Server...")
    
    # Start capture thread
    capture_thread = threading.Thread(target=capture_loop, daemon=True)
    capture_thread.start()
    
    ip_address = get_ip_address()
    
    logger.info("=" * 60)
    logger.info("🎥 Advanced Camera Server is running!")
    logger.info("=" * 60)
    logger.info(f"📍 Local URL:   http://localhost:{SERVER_PORT}")
    logger.info(f"🌐 Network URL: http://{ip_address}:{SERVER_PORT}")
    logger.info("=" * 60)
    
    try:
        server = ThreadedHTTPServer(('0.0.0.0', SERVER_PORT), AdvancedCameraHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("\n⏹️  Stopping...")
    finally:
        camera.cleanup()
        logger.info("Server stopped.")


if __name__ == '__main__':
    main()
