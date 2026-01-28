#!/usr/bin/env python3
"""
Raspberry Pi Camera Server
Streams camera feed over WiFi for viewing in a web browser.
Compatible with Raspberry Pi 4B running Trixie with Camera V2.
"""

import io
import logging
import socket
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from picamera2 import Picamera2

# Configuration
SERVER_PORT = 8080
FRAME_WIDTH = 1280
FRAME_HEIGHT = 720
FRAME_RATE = 30

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Global camera instance
picam2 = None


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


# Create global output buffer
output = StreamingOutput()


def capture_loop():
    """
    Continuously captures complete JPEG frames.
    This runs in a background thread.
    """
    global picam2
    logger.info("Starting capture loop...")
    
    # Pre-allocate a stream to reduce memory churn
    stream = io.BytesIO()
    
    while True:
        try:
            # Clear the stream for the new frame
            stream.seek(0)
            stream.truncate()
            
            # Capture one complete JPEG image
            picam2.capture_file(stream, format='jpeg')
            
            # Update the shared buffer with the complete image data
            output.update_frame(stream.getvalue())
            
        except Exception as e:
            logger.error(f"Capture error: {e}")
            time.sleep(1)


class CameraHandler(BaseHTTPRequestHandler):
    """HTTP request handler for camera streaming."""

    def log_message(self, format, *args):
        # Reduce log spam
        pass

    def do_GET(self):
        path = self.path.split('?')[0]
        
        if path == '/':
            self.send_index_page()
        elif path == '/stream.mjpg':
            self.send_mjpeg_stream()
        elif path == '/snapshot.jpg':
            self.send_snapshot()
        elif path == '/status':
            self.send_status()
        else:
            self.send_error(404, 'Not Found')

    def send_index_page(self):
        """Serve the main HTML page."""
        html = f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Pi Camera Stream</title>
    <style>
        body {{ background: #1a1a2e; color: #fff; font-family: sans-serif; text-align: center; margin: 0; }}
        h1 {{ margin-top: 20px; color: #00ff88; }}
        img {{ max-width: 100%; height: auto; border: 2px solid #00ff88; border-radius: 8px; margin-top: 10px; }}
        .btn {{ display: inline-block; padding: 10px 20px; margin: 10px; background: #00ff88; color: #000; text-decoration: none; border-radius: 20px; font-weight: bold; }}
    </style>
</head>
<body>
    <h1>🎥 Pi Camera Live</h1>
    <img src="/stream.mjpg" />
    <br>
    <a href="/snapshot.jpg" class="btn">📷 Snapshot</a>
</body>
</html>'''
        self.send_content(html.encode('utf-8'), 'text/html')

    def send_mjpeg_stream(self):
        """Stream MJPEG video."""
        self.send_response(200)
        self.send_header('Content-Type', 'multipart/x-mixed-replace; boundary=FRAME')
        self.send_header('Cache-Control', 'no-cache, private')
        self.send_header('Pragma', 'no-cache')
        self.end_headers()

        try:
            while True:
                with output.condition:
                    # Wait for a new frame with timeout to prevent deadlock
                    if not output.condition.wait(timeout=5.0):
                        continue  # Timeout, try again
                    frame = output.frame
                
                if frame:
                    self.wfile.write(b'--FRAME\r\n')
                    self.wfile.write(b'Content-Type: image/jpeg\r\n')
                    self.wfile.write(f'Content-Length: {len(frame)}\r\n\r\n'.encode())
                    self.wfile.write(frame)
                    self.wfile.write(b'\r\n')
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
            # Client disconnected - this is normal
            pass
        except Exception as e:
            logger.debug(f"Stream ended: {e}")

    def send_snapshot(self):
        with output.condition:
            output.condition.wait()
            frame = output.frame
        self.send_content(frame, 'image/jpeg')

    def send_status(self):
        self.send_content(b'{"status":"ok"}', 'application/json')

    def send_content(self, content, content_type):
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', len(content))
        self.end_headers()
        self.wfile.write(content)


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    """HTTP server that handles each request in a new thread."""
    allow_reuse_address = True
    daemon_threads = True


def get_ip_address():
    """Get the IP address of this device, works with hotspot mode too."""
    import netifaces
    
    # Priority order: wlan0 (hotspot), eth0, then any other interface
    preferred_interfaces = ['wlan0', 'eth0', 'en0', 'wlan1']
    
    try:
        interfaces = netifaces.interfaces()
        
        # First try preferred interfaces in order
        for iface in preferred_interfaces:
            if iface in interfaces:
                addrs = netifaces.ifaddresses(iface)
                if netifaces.AF_INET in addrs:
                    ip = addrs[netifaces.AF_INET][0].get('addr')
                    if ip and not ip.startswith('127.'):
                        return ip
        
        # Fall back to any interface with a valid IP
        for iface in interfaces:
            if iface == 'lo':
                continue
            addrs = netifaces.ifaddresses(iface)
            if netifaces.AF_INET in addrs:
                ip = addrs[netifaces.AF_INET][0].get('addr')
                if ip and not ip.startswith('127.'):
                    return ip
    except Exception:
        pass
    
    # Last resort: try the old method (works when connected to internet)
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def main():
    global picam2
    logger.info("Starting Camera Server...")

    # Initialize Picamera2
    picam2 = Picamera2()
    
    # Configure for still capture (works better for JPEG capture)
    config = picam2.create_still_configuration(
        main={"size": (FRAME_WIDTH, FRAME_HEIGHT)}
    )
    picam2.configure(config)
    picam2.start()

    # Start the background capture thread
    capture_thread = threading.Thread(target=capture_loop, daemon=True)
    capture_thread.start()

    ip_address = get_ip_address()
    
    logger.info("=" * 50)
    logger.info("Camera server is running!")
    logger.info("=" * 50)
    logger.info(f"Local URL:   http://localhost:{SERVER_PORT}")
    logger.info(f"Network URL: http://{ip_address}:{SERVER_PORT}")
    logger.info("=" * 50)

    try:
        server = ThreadedHTTPServer(('0.0.0.0', SERVER_PORT), CameraHandler)
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("\nStopping...")
    finally:
        picam2.stop()
        picam2.close()
        logger.info("Server stopped.")


if __name__ == '__main__':
    main()
