# Project Overview & API Specification: SonoBreed 360 AI

**SonoBreed 360 AI** is a real-time, AI-assisted ultrasound diagnostic suite designed specifically for sheep pregnancy scanning and monitoring. In veterinary and farming environments, determining sheep pregnancy and gestational stages manually requires significant specialized expertise. This project aims to automate and streamline that process by applying real-time deep learning models to ultrasound video streams, enabling veterinarians and technicians to rapidly identify key gestational structures, confirm pregnancy status, and log diagnostic data on a unified interface.

The application operates as an interactive diagnostics console. A typical scanning session begins by identifying the subject using RFID tag simulation or typing a unique identifier. Once registered, the user initiates the live ultrasound video feed. The system streams the video, processes each frame through a computer vision object detection model, overlays visual bounding boxes and labels for any detected anatomical features, and displays real-time telemetry such as frame rates, model inference speeds, and the active time taken for the current scan.

In addition to live streaming and inference, the application manages data recording and analytics. Every completed diagnostic scan is saved to a historical log containing the subject ID, detected features, final pregnancy stage categorization, the exact time taken (scan duration), and timestamps. The suite aggregates this data to present overall statistics, including pregnancy success rates, average scanning times, and gestational stage distributions, allowing operators to monitor the reproductive health trends and efficiency of their livestock scanning workflows over time.

---

## API Specification

This section details the API design and frame-ingestion abstraction layer for the SonoBreed 360 AI project. The interface is split into **HTTP REST endpoints** for session logging, system telemetry, and hardware connection management, and a **WebSocket endpoint** for low-latency, real-time image and AI metadata streaming.

### 1. Hardware & Video Ingestion Abstractions
To isolate the business logic and AI pipeline from the underlying physical hardware, the backend uses two core interface functions:
*   `check_probe_status() -> bool`: Determines if the ultrasound probe is active and connected. At application startup, this is hardcoded to return `False`.
*   `connect_probe() -> bool`: Attempts to scan for and connect to the physical probe.
*   `get_next_frame() -> np.ndarray | None`: Fetches the next image frame. In this mock suite, this reads frame-by-frame from a preloaded video file. In production, this will capture frames from the ultrasound probe interface (e.g., via a USB capture card, RTSP stream, or proprietary driver SDK).

### 2. HTTP REST Endpoints

#### A. System & Hardware Management
*   **`GET /api/system-info`**
    *   *Description*: Retrieves host system diagnostics and the current ultrasound probe connection state.
    *   *Response (`application/json`)*:
        ```json
        {
          "os": "Windows 11",
          "cpu": "Intel Core i7-12700K",
          "ram": "32.0 GB",
          "ram_load": 42,
          "gpu": "NVIDIA GeForce RTX 4070",
          "cores": 12,
          "cuda_available": true,
          "probe_connected": false
        }
        ```
*   **`POST /api/probe/connect`**
    *   *Description*: Triggers a hardware scan to establish a connection with the ultrasound probe. Invokes `connect_probe()` in the backend.
    *   *Response (`application/json`)*:
        ```json
        {
          "success": true,
          "probe_connected": true
        }
        ```

#### B. Scan Session Logging
*   **`POST /api/scans`**
    *   *Description*: Creates a new scanning record when a sheep RFID identification tag is scanned. Sets session status to `"scanning"`.
    *   *Input Validation Rules (FastAPI/Pydantic)*:
        *   `sheep_id`: Must be a string with length between **3 and 50 characters**.
        *   `sheep_id` Format: Must match the pattern `^[a-zA-Z0-9\-_ ]+$` (letters, numbers, hyphens, underscores, spaces; sanitizes against SQL injection or HTML tags).
    *   *Request (`application/json`)*:
        ```json
        { "sheep_id": "SH-Merino-891" }
        ```
    *   *Response (`application/json`)*:
        ```json
        { "scan_id": 42, "sheep_id": "SH-Merino-891", "status": "scanning" }
        ```
*   **`PATCH /api/scans/{scan_id}`**
    *   *Description*: Concludes a scanning session, updating the record with the final list of detected features and the total time taken (scan duration). Sets session status to `"finished"`.
    *   *Idempotency Guarantee*: This endpoint is idempotent. If called multiple times with the same payload (e.g. in network retry scenarios), the server updates the database once and returns success. If the scan is already in `"finished"` status, the server returns the existing record immediately without altering the `created_at` timestamp or other history.
    *   *Input Validation Rules (FastAPI/Pydantic)*:
        *   `detected_stage` & `final_diagnosis`: Must be one of the pre-defined stages: `["Pregnant (Early)", "Pregnant (Mid)", "Pregnant (Late)", "Non-Pregnant"]`.
        *   `features_detected`: Must be a list of strings, where each element must belong to the valid anatomical classes: `["fetal_fluid", "placentome", "body", "head", "heart", "abdomen", "ribs", "brain", "legs", "eyeorbit"]`.
        *   `duration`: Must be a float between **0.0 and 3600.0 seconds** (caps the session length at 1 hour to prevent corrupt time inputs).
    *   *Database Persistence Behavior*:
        The server takes these payload properties and executes an `UPDATE` statement mapping each JSON key directly to its corresponding database column, serializing lists as JSON strings:
        ```sql
        UPDATE scans
        SET
          detected_stage = :detected_stage,
          final_diagnosis = :final_diagnosis,
          features_detected = :features_detected_json_str,
          duration = :duration,
          status = 'finished'
        WHERE id = :scan_id;
        ```
    *   *Request (`application/json`)*:
        ```json
        {
          "detected_stage": "Pregnant (Mid)",
          "final_diagnosis": "Pregnant (Mid)",
          "features_detected": ["placentome", "fetal_fluid"],
          "duration": 14.5
        }
        ```
    *   *Response (`application/json`)*:
        ```json
        { "status": "success" }
        ```



*   **`GET /api/scans`**
    *   *Description*: Retrieves a paginated list of historical scan records, ordered by timestamp (newest first), along with aggregated global metrics.
    *   *Performance Optimization (Write-Through Caching)*: To prevent expensive database queries on every pagination request, the global `stats` object is computed once on startup and stored in an in-memory cache. 
        *   **Query Rules**: All aggregates are calculated **strictly where `status = 'finished'`** (excluding any in-progress `'scanning'` or `'started'` sessions to prevent data inflation).
        *   **Pregnancy Categorization**:
            *   `pregnant_count`: Calculated by summing records where `final_diagnosis` starts with `"Pregnant"`.
            *   `non_pregnant_count`: Calculated by summing records where `final_diagnosis` is exactly `"Non-Pregnant"`.
        *   **Cache Updates**: The cache is updated incrementally ($O(1)$ modification) during writes:
            *   On `POST /api/scans` (creating a scan): The scan starts in `'scanning'` status and is **ignored** by stats.
            *   On `PATCH /api/scans/{id}` (saving a scan): The session status changes to `'finished'`, and the backend increments counts and recalculates average duration directly in the cache.
            *   On `DELETE /api/scans/{id}` (deleting a scan): If the scan was `'finished'`, the backend decrements counts and updates the average duration in the cache.
            *   This ensures `GET` requests read pre-aggregated metrics instantly without executing SQL queries.
    *   *Query Parameters*:
        *   `page` (optional, default: `1`): The page number.
        *   `limit` (optional, default: `20`): Number of records per page.
    *   *Response (`application/json`)*:
        ```json
        {
          "records": [
            {
              "id": 42,
              "sheep_id": "SH-Merino-891",
              "detected_stage": "Pregnant (Mid)",
              "final_diagnosis": "Pregnant (Mid)",
              "features_detected": ["placentome", "fetal_fluid"],
              "status": "finished",

              "duration": 14.5,
              "created_at": "2026-06-15 12:20:00"
            }
          ],
          "page": 1,
          "limit": 20,
          "total_count": 143,
          "total_pages": 8,
          "stats": {
            "total_scans": 143,
            "pregnant_count": 121,
            "non_pregnant_count": 22,
            "pregnancy_rate": 84.6,
            "avg_scan_time": 11.1
          }
        }
        ```



*   **`DELETE /api/scans/{scan_id}`**
    *   *Description*: Deletes a specific scan record from the database.
    *   *Response (`application/json`)*:
        ```json
        { "status": "success" }
        ```

### 3. Real-Time Streaming (WebSocket)

*   **`WS /ws/stream`**
    *   *Description*: Open connection for streaming live frames and inference overlays.
    *   *Streaming Protocol Flow*:
        1. **Configuration**: The client must immediately send a JSON configuration message specifying preferences:
           ```json
           { "confidence_threshold": 0.5 }
           ```
        2. **Streaming Loop**: The server enters a continuous frame-by-frame loop:
           * Fetches the frame via `get_next_frame()`.
           * Runs YOLO inference.
           * Transmits a JSON metadata text packet:
             ```json
             {
               "type": "metadata",
               "frame_index": 120,
               "inference_ms": 12.5,
               "detections": [
                 {
                   "class_id": 1,
                   "class_name": "placentome",
                   "confidence": 0.84,
                   "bbox": [120.5, 90.0, 240.2, 210.5]
                 }
               ]
             }
             ```
           * Transmits a binary frame packet: Raw JPEG image bytes containing the annotated frame.

### WebSocket Error Handling & Close Codes
The connection lifecycle terminates under specific codes and actions to handle streaming exceptions:

*   **`4000` (Probe Not Connected)**: Connection rejected immediately if client tries to stream while `probe_connected` is `False`.
*   **`4001` (YOLO Model Error)**: Server closes connection with this code if the YOLO model fails to load or crashes mid-stream.
*   **`4002` (Invalid Handshake Config)**: Connection closed if the client fails to send the JSON setup configuration within 5 seconds of connecting, or sends invalid JSON.
*   **`1000` (Normal Closure - End of Stream)**:
    *   *Trigger*: When `get_next_frame()` returns `None` (reached end of mock video feed or stream ended).
    *   *Action*: Backend sends the final `"summary"` JSON frame, releases all video capture and reader thread resources, and closes the socket cleanly.
*   **`1006` / Client Disconnect (Abrupt Network Drop)**:
    *   *Trigger*: Network drop, client tab closure, or browser crash mid-stream.
    *   *Data Observability Guard (Auto-Finalization Task)*:
        1. FastAPI catches the `WebSocketDisconnect` exception and immediately releases the OpenCV reader buffer/file lock to prevent resources from leaking.
        2. Rather than leaving the scan record stuck in `"scanning"` status forever, the backend spawns a non-blocking background task (`asyncio.create_task`) with a **30-second timeout guard**.
        3. If the REST `PATCH /api/scans/{scan_id}` is **not** received within 30 seconds (meaning the client tab was closed permanently):
           * The background task automatically updates the database row, transitioning the status to `"finished"`.
           * It sets `final_diagnosis` equal to `detected_stage` (using the AI prediction as the fallback diagnosis).
           * It saves the `duration` based on the elapsed time recorded by the server-side stream loop.
           * It updates the stats cache in memory to include this scan.
           * It logs a `WARNING` stating `"Scan {scan_id} auto-finalized due to client disconnect."`
        4. If the `PATCH` request **is** received within 30 seconds:
           * The client-submitted values overwrite the record, transitioning it to `"finished"`, and the background timeout task exits cleanly without executing the fallback.



---

## Database Schema

The system uses SQLite (`sonogram.db`) for tracking scan history logs and performance metrics. The database contains a single primary table structured to support search query filtering, pagination, and backend-calculated diagnostic statistics.

### Table: `scans`

| Column Name | Data Type | Constraints / Defaults | Description |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | Unique identifier for the scan. |
| `sheep_id` | `TEXT` | `NOT NULL` | The electronic RFID tag or manually entered sheep identifier. |
| `detected_stage` | `TEXT` | Allows `NULL` | The pregnancy stage automatically detected/predicted by the AI. |
| `final_diagnosis` | `TEXT` | Allows `NULL` | The final confirmed diagnosis saved to the record. |
| `features_detected` | `TEXT` | Allows `NULL` | JSON-serialized array of unique anatomical features identified (e.g., `["placentome", "fetal_fluid"]`). |
| `status` | `TEXT` | `DEFAULT 'scanning'` | Scan session status (e.g., `'scanning'`, `'finished'`). |
| `duration` | `REAL` | `DEFAULT 0.0` | Total time taken for the scan session in seconds. |
| `created_at` | `TIMESTAMP` | `DEFAULT CURRENT_TIMESTAMP` | The date and time of the scan. |

### Indexes
To optimize performance for large-scale production datasets, the following database indexes are created:
*   **`idx_scans_sheep_id`**: Added to the `sheep_id` column to accelerate text-based search queries when filtering logs by animal ID.
*   **`idx_scans_status_created_at`**: A composite index on `(status, created_at DESC)`. This optimizes the pagination query by allowing the database to instantly filter for `'finished'` sessions and retrieve them in chronological order without executing an in-memory sorting routine.

---

## Project Directory Layout

To maintain professional industry standards without introducing unnecessary boilerplate, the project is structured with flat core modules and isolated router groups:

```
sono/
├── main.py                     # App entry point (launches the Uvicorn server)
├── project.md                  # Project overview, API specs, database, and layout details
├── requirements.txt            # Python dependency listings
└── app/
    ├── __init__.py
    ├── config.py               # Core configurations and project paths
    ├── database.py             # SQLite database connections and query abstractions
    ├── model_processor.py      # Ultralytics YOLO model processor wrapper
    ├── probe_source.py         # Hardware abstraction (probe state and frame acquisition)
    ├── server.py               # FastAPI application setup and middleware configuration
    └── routers/
        ├── __init__.py
        ├── scans.py            # HTTP REST routes for database scan logging (CRUD)
        ├── system.py           # HTTP REST routes for system telemetry and probe scan actions
        └── stream.py           # WebSocket stream route for live video and AI metadata
```

---

## Gestational Stage Detection Logic

To prevent single-frame false positives (noise) from affecting the final diagnosis, the backend implements a **Temporal Feature Confirmation Filter** over the course of each streaming session.

### 1. Feature Detection Counters
*   During the active WebSocket session, the server maintains an in-memory counter of all detected anatomical features that exceed the confidence threshold.
*   **Confidence Condition**: `confidence >= confidence_threshold` (e.g. `0.50`).
*   **Frame Count Threshold**: A biological feature is only marked as `"confirmed"` if it is successfully detected in **15 or more frames** during the session. Detections appearing in fewer frames are discarded as noise.

### 2. Stage Classification Logic
At the end of the streaming session, the backend checks the set of confirmed features and assigns the `detected_stage` based on the following hierarchy:

*   **Late Pregnancy (Days 101–155)**:
    *   *Indicator*: One or more late-stage fetal structures (`body`, `head`, `heart`, `abdomen`, `ribs`, `brain`, `legs`, `eyeorbit`) are confirmed (appear in $\ge 15$ frames).
*   **Mid Pregnancy (Days 46–100)**:
    *   *Indicator*: The `placentome` structure is confirmed (appears in $\ge 15$ frames) AND no late-stage features met the confirmation threshold.
*   **Early Pregnancy (Days 0–45)**:
    *   *Indicator*: The `fetal_fluid` structure is confirmed (appears in $\ge 15$ frames) AND no mid- or late-stage features met the confirmation threshold.
*   **Non-Pregnant**:
    *   *Indicator*: No gestational features crossed the 15-frame confirmation threshold.

### 3. Client-Server Summary Handshake
*   **WebSocket Summary Message**: When the stream ends, the server transmits a final JSON frame of type `"summary"` containing the calculated `detected_stage` and the list of `features_detected`.
*   **UI Selection**: The frontend displays this stage in the confirmation modal.
*   **REST Save (`PATCH /api/scans/{scan_id}`)**: When the operator clicks save, the frontend sends the user's confirmed `final_diagnosis` (which defaults to the AI prediction) and the client-side `duration` (in seconds) back to the server to persist the record in the database.


---

## WebSocket Flow Control & Probe Simulation

To ensure stable, real-time diagnostic performance, the backend coordinates playback speeds and handles hardware state changes through synchronization and connection simulation.

### 1. Real-Time Playback Synchronization
To maintain a steady 30 FPS playback regardless of hardware speed variations:
*   **Rate-Limiting (Fast Hardware)**: If YOLO inference is faster than the frame interval (e.g. 5ms instead of 33.3ms), the server calculates `interval - inference_time` and sleeps for that remaining duration before delivering the frame.
*   **Frame-Dropping (Slow Hardware)**: If YOLO inference runs slower than the frame interval (e.g. 80ms instead of 33.3ms), the server skips and discards intermediate frames from the OpenCV reader buffer, jumping immediately to the most recent frame. This prevents the UI stream from accumulating network lag.

### 2. Probe Connection Simulation
*   **Mimicked Handshake**: When the client hits `POST /api/probe/connect`, the backend waits for a simulated 2 seconds to mimic a hardware probe handshake. Once this delay completes, `probe_connected` is set to `True`.
*   *Implementation Note*: Any simulated code or hardware-mimicking behaviors must be explicitly commented in the source code (e.g., using `TODO / MIMIC` tags) to ensure they can be easily identified and replaced when integrating physical ultrasound hardware in production.

---

## YOLO Inference & Network Optimization

To ensure the AI processing and video stream operate smoothly under local CPU/GPU resource constraints and to minimize network traffic overhead:

### 1. Dynamic Frame Rescaling (Inference Optimization)
*   Before feeding a raw image frame from the video source into the YOLO model, the backend checks the image width.
*   If the frame width is larger than **512 pixels**, it is dynamically resized to 512px (maintaining its aspect ratio) using OpenCV bilinear interpolation (`cv2.INTER_LINEAR`). This dramatically reduces the matrix dimensions and CPU/GPU processing latency, guaranteeing a stable 30 FPS inference speed.

### 2. JPEG Bandwidth Compression (Stream Optimization)
*   The JPEG compression quality parameter is capped at **35** (`cv2.IMWRITE_JPEG_QUALITY`). This compresses the payload size significantly, reducing the network bandwidth required by the WebSocket stream while retaining clean, human-readable visual details for the operator.

---

## Logging, Monitoring, & Health Checks

To ensure production observability and facilitate debugging, the backend implements structured logging, a standardized error payload format, and a dedicated health check endpoint.

### 1. Health Check Endpoint (`GET /health`)
*   **Description**: A lightweight endpoint to monitor server status and external dependency health (database, model, and probe).
*   **Response Payload (`application/json`)**:
    ```json
    {
      "status": "healthy",
      "timestamp": "2026-06-15T15:58:36Z",
      "services": {
        "database": "connected",
        "yolo_model": "loaded",
        "probe": "connected"
      }
    }
    ```
    *   *Failure behavior*: If the SQLite database is unreachable or the YOLO model failed to load, the endpoint returns a `503 Service Unavailable` status with the details.

### 2. Structured JSON Logging
The application uses structured JSON logging (outputting directly to `stdout`) to enable parsing by standard log aggregators.
*   **Log Fields**: `timestamp`, `level` (INFO, WARNING, ERROR, DEBUG), `module` (e.g. `routers.stream`), `message`, and context-specific variables (such as `scan_id` or `elapsed_ms`).
*   **WebSocket Latency Tracking**: The WebSocket stream logging includes frame inference metrics. If YOLO inference latency exceeds **35ms**, a `WARNING` log is issued:
    ```json
    {"timestamp": "2026-06-15T15:58:36.102Z", "level": "WARNING", "module": "services.model", "message": "Inference latency warning", "inference_ms": 42.5}
    ```

### 3. Standardized Error Payloads
In the event of an API failure, the server returns a structured error response to help frontend debugging:
*   **Response Schema**:
    ```json
    {
      "error_code": "VALIDATION_FAILED",
      "message": "Field 'sheep_id' must match pattern '^[a-zA-Z0-9\\-_ ]+$'.",
      "timestamp": "2026-06-15T15:58:36Z"
    }
    ```
*   **Error Codes**:
    *   `RESOURCE_NOT_FOUND`: Database query returned no matching scan record.
    *   `VALIDATION_FAILED`: Incoming REST request payload failed Pydantic validation rules.
    *   `PROBE_DISCONNECTED`: Streaming socket requested while the probe status is offline.
    *   `DATABASE_ERROR`: Database connection or write operation failed.






