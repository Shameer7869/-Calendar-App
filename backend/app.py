from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
import re
from datetime import datetime, timedelta
import os

app = Flask(__name__)

# Configure CORS properly
CORS(app, origins=["http://localhost:5173", "http://localhost:3000"], 
     supports_credentials=True)

# Allow all routes for development
@app.after_request
def after_request(response):
    origin = request.headers.get('Origin')
    if origin in ['http://localhost:5173', 'http://localhost:3000']:
        response.headers.add('Access-Control-Allow-Origin', origin)
        response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
        response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
        response.headers.add('Access-Control-Allow-Credentials', 'true')
        response.headers.add('Access-Control-Max-Age', '3600')
    return response

# Handle OPTIONS requests for CORS preflight
@app.route("/api/<path:path>", methods=["OPTIONS"])
def options_handler(path):
    response = jsonify()
    response.headers.add('Access-Control-Allow-Origin', '*')
    response.headers.add('Access-Control-Allow-Headers', 'Content-Type,Authorization,Accept')
    response.headers.add('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    response.headers.add('Access-Control-Allow-Credentials', 'true')
    return response, 200

@app.route("/", methods=["GET"])
def home():
    return jsonify({"message": "Calendar API is running!", "status": "ok"})

DB = "schedule.db"

# Database connection
def get_db():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    return conn

# Initialize database with proper column checking
def init_db():
    with get_db() as db:
        # Create table with all columns
        db.execute("""
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            date TEXT NOT NULL,
            location TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
        
        # Check if location column exists, if not add it
        cursor = db.execute("PRAGMA table_info(events)")
        columns = [column[1] for column in cursor.fetchall()]
        
        # Add missing columns if they don't exist
        if 'location' not in columns:
            db.execute("ALTER TABLE events ADD COLUMN location TEXT DEFAULT ''")
            print("✅ Added 'location' column to events table")
        
        if 'notes' not in columns:
            db.execute("ALTER TABLE events ADD COLUMN notes TEXT DEFAULT ''")
            print("✅ Added 'notes' column to events table")
        
        db.commit()

# Validate title - 5+ characters
def validate_title(title):
    if len(title.strip()) < 5:
        return False, "Title must be at least 5 characters long"
    if not any(c.isalpha() for c in title):
        return False, "Title must contain at least one letter"
    return True, ""

# Validate date format and ensure not in past
def validate_date(date_str):
    try:
        # Accept DD/MM/YYYY format
        date_obj = datetime.strptime(date_str, "%d/%m/%Y")
        
        # Check if date is in past
        today = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
        if date_obj < today:
            return False, "Cannot add events to past dates. Please select today or a future date."
            
        return True, date_obj.strftime("%Y-%m-%d")  # Convert to YYYY-MM-DD for storage
    except ValueError:
        return False, "Date must be in DD/MM/YYYY format"

# Validate notes - Maximum 23 words
def validate_notes(notes):
    if not notes or notes.strip() == "":
        return True, ""  # Notes are optional
    
    word_count = len(notes.strip().split())
    if word_count > 23:
        return False, f"Notes must be maximum 23 words (currently {word_count})"
    return True, ""

# Cleanup past events
def cleanup_past_events():
    today = datetime.now().strftime("%Y-%m-%d")
    with get_db() as db:
        db.execute("DELETE FROM events WHERE date < ?", (today,))
        db.commit()

# Test endpoint
@app.route("/api/test", methods=["GET"])
def test():
    return jsonify({"message": "Backend is running!", "port": 5000})

# Get all events (with automatic cleanup on load)
@app.route("/api/events", methods=["GET"])
def get_events():
    month = request.args.get("month")  # YYYY-MM
    
    # Clean up past events on every fetch
    cleanup_past_events()
    
    with get_db() as db:
        if month:
            rows = db.execute("SELECT * FROM events WHERE date LIKE ? ORDER BY date", (f"{month}%",)).fetchall()
        else:
            rows = db.execute("SELECT * FROM events ORDER BY date").fetchall()
    events = [dict(row) for row in rows]
    return jsonify(events)

# Get single event
@app.route("/api/events/<int:event_id>", methods=["GET"])
def get_event(event_id):
    with get_db() as db:
        row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
    if row:
        return jsonify(dict(row))
    return jsonify({"error": "Event not found"}), 404

# Add new event
@app.route("/api/events", methods=["POST"])
def add_event():
    try:
        data = request.get_json()
        print(f"Received data: {data}")  # Debug log
        
        if not data:
            return jsonify({"error": "No data provided"}), 400
        
        # Validate title
        is_valid, error_msg = validate_title(data.get("title", ""))
        if not is_valid:
            return jsonify({"error": error_msg}), 400
        
        # Validate date
        is_valid, date_formatted = validate_date(data.get("date", ""))
        if not is_valid:
            return jsonify({"error": date_formatted}), 400
        
        # Validate notes (optional, max 23 words)
        if "notes" in data and data["notes"]:
            is_valid, error_msg = validate_notes(data.get("notes", ""))
            if not is_valid:
                return jsonify({"error": error_msg}), 400
        
        with get_db() as db:
            cursor = db.execute(
                "INSERT INTO events (title, date, location, notes) VALUES (?, ?, ?, ?)",
                (data["title"], date_formatted, data.get("location", ""), data.get("notes", ""))
            )
            db.commit()
            event_id = cursor.lastrowid
            
            # Return the created event
            row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
        return jsonify(dict(row))
    except Exception as e:
        print(f"Error in add_event: {str(e)}")  # Debug log
        return jsonify({"error": str(e)}), 500

# Update event
@app.route("/api/events/<int:event_id>", methods=["PUT"])
def update_event(event_id):
    try:
        data = request.get_json()
        print(f"Updating event {event_id}: {data}")  # Debug log
        
        # Validate title if provided
        if "title" in data:
            is_valid, error_msg = validate_title(data["title"])
            if not is_valid:
                return jsonify({"error": error_msg}), 400
        
        # Validate date if provided
        if "date" in data:
            is_valid, date_formatted = validate_date(data["date"])
            if not is_valid:
                return jsonify({"error": date_formatted}), 400
            data["date"] = date_formatted
        
        # Validate notes if provided
        if "notes" in data and data["notes"]:
            is_valid, error_msg = validate_notes(data["notes"])
            if not is_valid:
                return jsonify({"error": error_msg}), 400
        
        with get_db() as db:
            # Build update query dynamically
            update_fields = []
            values = []
            
            for field in ["title", "date", "location", "notes"]:
                if field in data:
                    update_fields.append(f"{field} = ?")
                    values.append(data[field])
            
            if not update_fields:
                return jsonify({"error": "No fields to update"}), 400
            
            values.append(event_id)
            query = f"UPDATE events SET {', '.join(update_fields)} WHERE id = ?"
            
            db.execute(query, values)
            db.commit()
            
            # Return updated event
            row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
            if row:
                return jsonify(dict(row))
            return jsonify({"error": "Event not found"}), 404
    except Exception as e:
        print(f"Error in update_event: {str(e)}")  # Debug log
        return jsonify({"error": str(e)}), 500

# Delete event
@app.route("/api/events/<int:event_id>", methods=["DELETE"])
def delete_event(event_id):
    try:
        with get_db() as db:
            # First get the event to return it
            row = db.execute("SELECT * FROM events WHERE id = ?", (event_id,)).fetchone()
            if not row:
                return jsonify({"error": "Event not found"}), 404
            
            db.execute("DELETE FROM events WHERE id = ?", (event_id,))
            db.commit()
            return jsonify(dict(row))
    except Exception as e:
        print(f"Error in delete_event: {str(e)}")  # Debug log
        return jsonify({"error": str(e)}), 500

# Cleanup endpoint (for manual trigger)
@app.route("/api/events/cleanup", methods=["POST"])
def cleanup():
    cleanup_past_events()
    return jsonify({"message": "Past events cleaned up"})

# Health check endpoint
@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        with get_db() as db:
            db.execute("SELECT 1")
        return jsonify({"status": "healthy", "database": "connected"})
    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500

if __name__ == "__main__":
    # Delete existing database to recreate with proper schema
    if os.path.exists(DB):
        print(f"⚠️  Deleting old database file: {DB}")
        os.remove(DB)
    
    init_db()
    cleanup_past_events()  # Clean up on startup
    print("🚀 Starting Flask server on http://localhost:5000")
    print("🔗 Test endpoint: http://localhost:5000/api/test")
    print("🔗 Health check: http://localhost:5000/api/health")
    print("🔗 API base URL: http://localhost:5000/api")
    print("🔗 Frontend should be running on http://localhost:5173")
    app.run(debug=True, port=5000, host='0.0.0.0')