# Clotho Engine: Core Architecture

**Goal:** A low-latency bridge between the Operating System (Screen/Input) and the AI reasoning layer (TS/vLLM).

## 1. The C++ Daemon (The "Eye & Hand")
We cannot rely on Node.js/Python for screen capture and raw input—it's too slow and prone to OS-level permission issues.
- **Responsibility:**
  1. Capture the active window framebuffer at 10-20 FPS.
  2. Inject hardware-level keystrokes (using `SendInput` on Windows or `uinput`/`XTest` on Linux).
- **Interface:** Runs as a lightweight local daemon (or compiled as an N-API module).

## 2. The TypeScript Orchestrator (The "Spinal Cord")
- **Responsibility:**
  1. Receives the raw frame from the C++ Daemon.
  2. Manages the short-term state (HP, inventory parsed via basic OCR or game mods if needed, though pure vision is preferred).
  3. Sends the frame to the `vLLM` server.
  4. Parses the returned `Action Token` from the AI.
  5. Sends the exact keystroke command back to the C++ Daemon.

## 3. IPC (Inter-Process Communication)
If C++ is a daemon, how does TS talk to it with <1ms latency?
- **Shared Memory (/dev/shm or Memory Mapped Files):** The absolute fastest way to pass raw image frames from C++ to TS without serialization overhead.
- **Local Unix Sockets / Named Pipes:** For sending the tiny keystroke commands from TS to C++.

## Next Steps
- Write the exact JSON schemas for the IPC communication.
- Define the exact list of `Action Tokens` the AI is allowed to output.