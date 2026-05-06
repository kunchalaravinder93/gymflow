import { useEffect, useRef, useCallback, useState } from "react";

interface QrScannerProps {
  onResult: (data: string) => void;
  onError?: (error: string) => void;
  isActive?: boolean;
}

export function QrScanner({ onResult, onError, isActive = true }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const [status, setStatus] = useState<"requesting" | "scanning" | "error">("requesting");
  const [errorMsg, setErrorMsg] = useState("");
  const lastScannedRef = useRef<string>("");
  const lastScannedTimeRef = useRef<number>(0);

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }, []);

  const scanFrame = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) { rafRef.current = requestAnimationFrame(scanFrame); return; }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Dynamically import jsQR to avoid SSR issues
    const jsQR = (await import("jsqr")).default;
    const code = jsQR(imageData.data, imageData.width, imageData.height);

    if (code && code.data) {
      const now = Date.now();
      // Debounce: don't re-fire same QR within 3 seconds
      if (code.data !== lastScannedRef.current || now - lastScannedTimeRef.current > 3000) {
        lastScannedRef.current = code.data;
        lastScannedTimeRef.current = now;
        onResult(code.data);
      }
    }

    rafRef.current = requestAnimationFrame(scanFrame);
  }, [onResult]);

  useEffect(() => {
    if (!isActive) { stopCamera(); return; }

    async function startCamera() {
      try {
        setStatus("requesting");
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStatus("scanning");
        rafRef.current = requestAnimationFrame(scanFrame);
      } catch (err: any) {
        const msg = err?.name === "NotAllowedError"
          ? "Camera access denied. Please allow camera access in your browser settings."
          : "Could not access camera. Please ensure a camera is connected.";
        setErrorMsg(msg);
        setStatus("error");
        onError?.(msg);
      }
    }

    startCamera();
    return () => { stopCamera(); };
  }, [isActive, scanFrame, stopCamera, onError]);

  return (
    <div className="relative w-full aspect-video bg-black rounded-xl overflow-hidden">
      {/* Hidden canvas for frame processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Camera video */}
      <video
        ref={videoRef}
        muted
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Status overlays */}
      {status === "requesting" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70">
          <div className="text-center text-white">
            <div className="w-12 h-12 border-4 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Requesting camera access...</p>
          </div>
        </div>
      )}

      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6">
          <div className="text-center text-white max-w-xs">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.07 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-sm">{errorMsg}</p>
          </div>
        </div>
      )}

      {/* Scanning frame overlay */}
      {status === "scanning" && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Dimmed background with cutout effect */}
          <div className="absolute inset-0 bg-black/30" />

          {/* Scanning frame */}
          <div className="relative w-56 h-56">
            {/* Corner brackets */}
            <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-green-400 rounded-tl-lg" />
            <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-green-400 rounded-tr-lg" />
            <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-green-400 rounded-bl-lg" />
            <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-green-400 rounded-br-lg" />

            {/* Scanning line animation */}
            <div className="absolute left-1 right-1 h-0.5 bg-green-400/80 animate-[scan_2s_linear_infinite]"
              style={{ boxShadow: "0 0 8px 2px rgba(74,222,128,0.6)", top: "50%" }} />
          </div>

          <p className="absolute bottom-6 text-white/80 text-sm font-medium tracking-wide">
            Align QR code within the frame
          </p>
        </div>
      )}

      <style>{`
        @keyframes scan {
          0% { top: 8px; }
          50% { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
      `}</style>
    </div>
  );
}
