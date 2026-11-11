import os
import threading
import queue
import tkinter as tk
from tkinter import ttk, filedialog, messagebox


def split_files(file_path: str, chunk_size: int, q: queue.Queue) -> None:
    """Worker thread: split *file_path* into chunks of *chunk_size* bytes.

    File operations are performed here, and progress or errors are reported
    through the queue *q* so the GUI can be updated from the main thread."""
    try:
        total_size = os.path.getsize(file_path)
        written = 0
        with open(file_path, "rb") as src:
            part = 1
            while True:
                data = src.read(chunk_size)
                if not data:
                    break
                part_path = f"{file_path}.part{part}"
                with open(part_path, "wb") as dst:
                    dst.write(data)
                written += len(data)
                progress = int(written / total_size * 100)
                q.put(("progress", progress))
                part += 1
        q.put(("done", f"Created {part - 1} parts."))
    except Exception as exc:  # pragma: no cover - GUI app
        q.put(("error", str(exc)))


def start_split(root: tk.Tk, q: queue.Queue, progress_var: tk.IntVar) -> None:
    """Prompt for a file and start the background splitting thread."""
    file_path = filedialog.askopenfilename()
    if not file_path:
        return
    # For demonstration purposes we use a fixed chunk size of 1 MB.
    thread = threading.Thread(
        target=split_files, args=(file_path, 1024 * 1024, q), daemon=True
    )
    thread.start()
    progress_var.set(0)


def process_events(root: tk.Tk, q: queue.Queue, progress_var: tk.IntVar) -> None:
    """Poll the queue for events and update the GUI accordingly."""
    try:
        while True:
            event, payload = q.get_nowait()
            if event == "progress":
                progress_var.set(payload)
            elif event == "done":
                progress_var.set(100)
                messagebox.showinfo("Success", payload)
            elif event == "error":
                messagebox.showerror("Error", payload)
    except queue.Empty:
        pass
    finally:
        root.after(100, process_events, root, q, progress_var)


if __name__ == "__main__":  # pragma: no cover - manual demo
    root = tk.Tk()
    root.title("File Splitter")

    q: queue.Queue = queue.Queue()
    progress_var = tk.IntVar(value=0)
    progress = ttk.Progressbar(root, variable=progress_var, maximum=100)
    progress.pack(fill="x", padx=10, pady=10)

    ttk.Button(root, text="Split File", command=lambda: start_split(root, q, progress_var)).pack(pady=5)

    root.after(100, process_events, root, q, progress_var)
    root.mainloop()
