"use client"

import { useState, useEffect, useRef } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import interactionPlugin from "@fullcalendar/interaction"
import axios from "axios"
import toast, { Toaster } from "react-hot-toast"
import { Calendar, Plus, Eye, X, Save, Trash2, Edit3, ChevronLeft, ChevronRight, MapPin, FileText } from "lucide-react"
import Modal from "react-modal"
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isToday,
} from "date-fns"
import "./App.css"

function App() {
  const [events, setEvents] = useState([])
  const [darkMode, setDarkMode] = useState(false)
  const [showEventsTable, setShowEventsTable] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailsModal, setShowDetailsModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventToDelete, setEventToDelete] = useState(null)
  const [editingEvent, setEditingEvent] = useState(null)
  const [isEditing, setIsEditing] = useState(false)
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    location: "",
    notes: "",
  })
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [modalReady, setModalReady] = useState(false)
  const [miniCalendarMonth, setMiniCalendarMonth] = useState(new Date())

  const calendarRef = useRef(null)
  const eventsTableRef = useRef(null)
  const appRef = useRef(null)

  // Configure axios
  const API_BASE_URL =
    typeof window !== "undefined" && import.meta.env?.PROD
      ? window.location.origin + "/api"
      : "http://localhost:5000/api"

  useEffect(() => {
    if (appRef.current) {
      Modal.setAppElement(appRef.current)
      setModalReady(true)
    }
  }, [])

  // Fetch events from backend
  useEffect(() => {
    fetchEvents()
    testApiConnection()
  }, [])

  // Manage body scroll when modals are open
  useEffect(() => {
    if (showAddModal || showDetailsModal || showDeleteModal) {
      document.body.classList.add("modal-open")
    } else {
      document.body.classList.remove("modal-open")
    }
    return () => {
      document.body.classList.remove("modal-open")
    }
  }, [showAddModal, showDetailsModal, showDeleteModal])

  const testApiConnection = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/test`)
      toast.success("Connected to backend successfully!")
    } catch (error) {
      console.error("API Connection Failed:", error)
      toast.error(`Cannot connect to backend. Make sure it's running on port 5000.`)
    }
  }

  const fetchEvents = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/events`)
      if (Array.isArray(res.data)) {
        setEvents(res.data)
      } else {
        setEvents([])
      }
    } catch (error) {
      console.error("Error fetching events:", error)
      toast.error("Failed to fetch events. Check backend connection.")
      setEvents([])
    } finally {
      setLoading(false)
    }
  }

  // Dark mode effect
  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark-mode")
    } else {
      document.body.classList.remove("dark-mode")
    }
  }, [darkMode])

  const getMiniCalendarDays = () => {
    const start = startOfMonth(miniCalendarMonth)
    const end = endOfMonth(miniCalendarMonth)
    const days = eachDayOfInterval({ start, end })

    // Add padding days for start of month
    const startDay = getDay(start)
    const paddingDays = []
    for (let i = 0; i < startDay; i++) {
      paddingDays.push(null)
    }

    return [...paddingDays, ...days]
  }

  const hasEventOnDate = (date) => {
    if (!date) return false
    return events.some((event) => {
      const eventDate = event.date.includes("/")
        ? new Date(event.date.split("/").reverse().join("-"))
        : new Date(event.date)
      return isSameDay(eventDate, date)
    })
  }

  const handleMiniCalendarDateClick = (date) => {
    if (!date) return
    const formattedDate = format(date, "dd/MM/yyyy")
    setNewEvent((prev) => ({
      ...prev,
      date: formattedDate,
    }))
    setShowAddModal(true)

    // Also navigate the main calendar to this date
    if (calendarRef.current) {
      const calendarApi = calendarRef.current.getApi()
      calendarApi.gotoDate(date)
    }
  }

  // Date click handler - opens add event modal
  const handleDateClick = (info) => {
    const dateObj = new Date(info.dateStr)
    const formattedDate = format(dateObj, "dd/MM/yyyy")

    setNewEvent((prev) => ({
      ...prev,
      date: formattedDate,
    }))
    setShowAddModal(true)
  }

  // Event click handler - opens details for clicked calendar event
  const handleEventClick = (info) => {
    const clickedEventId = info.event.id
    const event = events.find((e) => e.id == clickedEventId)
    if (event) {
      handleShowDetails(event)
    }
  }

  // Handle input change for new event
  const handleNewEventChange = (e) => {
    const { name, value } = e.target
    setNewEvent((prev) => ({
      ...prev,
      [name]: value,
    }))

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: "",
      }))
    }
  }

  // Handle input change for editing event
  const handleEditEventChange = (e) => {
    const { name, value } = e.target
    setEditingEvent((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  // Validate form
  const validateForm = (eventData) => {
    const newErrors = {}

    // Title validation: at least 5 characters
    if (!eventData.title || eventData.title.trim().length < 5) {
      newErrors.title = "Title must be at least 5 characters long"
    } else if (!/[a-zA-Z]/.test(eventData.title)) {
      newErrors.title = "Title must contain at least one letter"
    }

    // Date validation: DD/MM/YYYY format and not in past
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
    if (!eventData.date || !dateRegex.test(eventData.date)) {
      newErrors.date = "Date must be in DD/MM/YYYY format"
    } else {
      const [day, month, year] = eventData.date.split("/").map(Number)
      const dateObj = new Date(year, month - 1, day)
      const today = new Date()
      today.setHours(0, 0, 0, 0)

      if (dateObj.getFullYear() !== year || dateObj.getMonth() + 1 !== month || dateObj.getDate() !== day) {
        newErrors.date = "Invalid date"
      } else if (dateObj < today) {
        newErrors.date = "Cannot add events to past dates. Please select today or a future date."
      }
    }

    // Notes validation: Maximum 23 words (optional)
    if (eventData.notes && eventData.notes.trim()) {
      const notesWords = eventData.notes
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0)
      if (notesWords.length > 23) {
        newErrors.notes = `Notes must be maximum 23 words (currently ${notesWords.length})`
      }
    }

    return newErrors
  }

  // Add new event
  const handleAddEvent = async () => {
    const formErrors = validateForm(newEvent)

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      return
    }

    try {
      const response = await axios.post(`${API_BASE_URL}/events`, newEvent, {
        headers: {
          "Content-Type": "application/json",
        },
      })
      toast.success("Event added successfully!")
      fetchEvents()
      setShowAddModal(false)
      setNewEvent({
        title: "",
        date: "",
        location: "",
        notes: "",
      })
      setErrors({})
    } catch (error) {
      console.error("Add event error:", error)
      if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else if (error.message.includes("Network Error") || error.message.includes("CORS")) {
        toast.error("Cannot connect to backend. Make sure it's running on port 5000.")
      } else {
        toast.error("Failed to add event. Check server connection.")
      }
    }
  }

  // Show event details
  const handleShowDetails = (event) => {
    setSelectedEvent(event)
    setEditingEvent({ ...event })
    setIsEditing(false)
    setShowDetailsModal(true)
  }

  // Update event
  const handleUpdateEvent = async () => {
    if (!isEditing) {
      setIsEditing(true)
      return
    }

    const formErrors = validateForm(editingEvent)

    if (Object.keys(formErrors).length > 0) {
      setErrors(formErrors)
      return
    }

    try {
      const response = await axios.put(`${API_BASE_URL}/events/${editingEvent.id}`, editingEvent)
      toast.success("Event updated successfully!")
      fetchEvents()
      setSelectedEvent(editingEvent)
      setIsEditing(false)
      setErrors({})
    } catch (error) {
      console.error("Update event error:", error)
      if (error.response?.data?.error) {
        toast.error(error.response.data.error)
      } else {
        toast.error("Failed to update event")
      }
    }
  }

  // Confirm delete event
  const confirmDelete = (event) => {
    setEventToDelete(event)
    setShowDeleteModal(true)
  }

  // Delete event
  const handleDeleteEvent = async () => {
    if (!eventToDelete) return

    try {
      await axios.delete(`${API_BASE_URL}/events/${eventToDelete.id}`)
      toast.success("Event deleted successfully!")
      fetchEvents()
      setShowDetailsModal(false)
      setShowDeleteModal(false)
      setSelectedEvent(null)
      setEventToDelete(null)
    } catch (error) {
      console.error("Delete event error:", error)
      toast.error("Failed to delete event")
    }
  }

  // Format date for display
  const formatDateForDisplay = (dateStr) => {
    try {
      if (!dateStr) return ""
      if (dateStr.includes("/")) {
        return dateStr // Already in DD/MM/YYYY
      }
      const dateObj = parseISO(dateStr)
      return format(dateObj, "dd/MM/yyyy")
    } catch {
      return dateStr
    }
  }

  // Toggle events table with scroll
  const toggleEventsTable = () => {
    setShowEventsTable(!showEventsTable)
    if (!showEventsTable) {
      setTimeout(() => {
        eventsTableRef.current?.scrollIntoView({ behavior: "smooth" })
      }, 100)
    } else {
      window.scrollTo({ top: 0, behavior: "smooth" })
    }
  }

  // Close events table
  const closeEventsTable = () => {
    setShowEventsTable(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  // Calculate word count
  const getWordCount = (text) => {
    if (!text || text.trim() === "") return 0
    return text
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0).length
  }

  // Calculate character count
  const getCharCount = (text) => {
    return text ? text.length : 0
  }

  // Prepare events for calendar
  const calendarEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    date: event.date.includes("/") ? event.date.split("/").reverse().join("-") : event.date,
  }))

  const miniCalendarDays = getMiniCalendarDays()
  const weekDays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

  return (
    <div className="App" ref={appRef}>
      <Toaster
        position="top-right"
        toastOptions={{
          duration: 4000,
          style: {
            background: darkMode ? "#1e293b" : "#0f766e",
            color: "#ffffff",
            border: darkMode ? "1px solid #f59e0b" : "1px solid #14b8a6",
            borderRadius: "10px",
            fontSize: "0.9rem",
          },
        }}
      />

      {/* Header */}
      <header className="app-header">
        <div className="header-left">
          <Calendar className="calendar-icon" />
          <h1 className="header-title">Calendar App</h1>
        </div>
        <div className="header-right">
          <button className="view-events-btn" onClick={toggleEventsTable}>
            <Eye size={18} />
            <span>{showEventsTable ? "Hide Events" : "View Events"}</span>
          </button>
          <button className="dark-toggle" onClick={() => setDarkMode(!darkMode)}>
            {darkMode ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="calendar-layout">
          {/* Mini Calendar Sidebar */}
          <aside className="mini-calendar-sidebar">
            <div className="mini-calendar">
              <div className="mini-calendar-header">
                <button className="mini-nav-btn" onClick={() => setMiniCalendarMonth(subMonths(miniCalendarMonth, 1))}>
                  <ChevronLeft size={16} />
                </button>
                <span className="mini-month-title">{format(miniCalendarMonth, "MMMM yyyy")}</span>
                <button className="mini-nav-btn" onClick={() => setMiniCalendarMonth(addMonths(miniCalendarMonth, 1))}>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="mini-calendar-grid">
                {weekDays.map((day) => (
                  <div key={day} className="mini-weekday">
                    {day}
                  </div>
                ))}
                {miniCalendarDays.map((date, index) => (
                  <button
                    key={index}
                    className={`mini-day ${!date ? "empty" : ""} ${date && isToday(date) ? "today" : ""} ${
                      date && hasEventOnDate(date) ? "has-event" : ""
                    }`}
                    onClick={() => handleMiniCalendarDateClick(date)}
                    disabled={!date}
                  >
                    {date ? format(date, "d") : ""}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Add Button */}
            <button
              className="quick-add-btn"
              onClick={() => {
                setShowAddModal(true)
                setNewEvent({
                  title: "",
                  date: format(new Date(), "dd/MM/yyyy"),
                  location: "",
                  notes: "",
                })
              }}
            >
              <Plus size={18} />
              <span>Add Event</span>
            </button>

            {/* Upcoming Events Preview */}
            <div className="upcoming-events">
              <h3 className="upcoming-title">Upcoming Events</h3>
              <div className="upcoming-list">
                {events.length === 0 ? (
                  <p className="no-upcoming">No events scheduled</p>
                ) : (
                  events.slice(0, 4).map((event) => (
                    <div key={event.id} className="upcoming-item" onClick={() => handleShowDetails(event)}>
                      <div className="upcoming-dot"></div>
                      <div className="upcoming-info">
                        <span className="upcoming-event-title">{event.title}</span>
                        <span className="upcoming-event-date">{formatDateForDisplay(event.date)}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>

          {/* Main Calendar */}
          <div className="calendar-container">
            {loading && (
              <div className="loading-overlay">
                <div className="loading-spinner"></div>
                <p>Loading events...</p>
              </div>
            )}
            <FullCalendar
              ref={calendarRef}
              plugins={[dayGridPlugin, interactionPlugin]}
              initialView="dayGridMonth"
              events={calendarEvents}
              dateClick={handleDateClick}
              eventClick={handleEventClick}
              headerToolbar={{
                left: "prev,next today",
                center: "title",
                right: "dayGridMonth,dayGridWeek,dayGridDay",
              }}
              height="auto"
              contentHeight="auto"
            />
          </div>
        </div>

        {showEventsTable && (
          <div className="events-table-section" ref={eventsTableRef}>
            <div className="section-header">
              <div className="section-header-left">
                <h2 className="section-title">All Events</h2>
                <span className="event-count">{events.length} events</span>
              </div>
              <button
                className="add-event-btn"
                onClick={() => {
                  setShowAddModal(true)
                  setNewEvent({
                    title: "",
                    date: "",
                    location: "",
                    notes: "",
                  })
                }}
              >
                <Plus size={18} />
                <span>Add Event</span>
              </button>
            </div>

            <div className="events-table-container">
              <table className="events-table">
                <thead>
                  <tr>
                    <th className="number-col">#</th>
                    <th className="title-col">Event</th>
                    <th className="date-col">Date</th>
                    <th className="location-col">Location</th>
                    <th className="action-col">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {events.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="no-events">
                        <div className="no-events-content">
                          <Calendar size={32} />
                          <p>{loading ? "Loading events..." : "No events scheduled"}</p>
                          <span>Click "Add Event" to create your first event</span>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    events.map((event, index) => (
                      <tr key={event.id} className="event-row">
                        <td className="number-cell">{index + 1}</td>
                        <td className="title-cell">
                          <div className="event-title-wrapper">
                            <span className="event-indicator"></span>
                            <span className="event-name">{event.title}</span>
                          </div>
                        </td>
                        <td className="date-cell">
                          <span className="date-badge">{formatDateForDisplay(event.date)}</span>
                        </td>
                        <td className="location-cell">
                          {event.location ? (
                            <div className="location-wrapper">
                              <MapPin size={14} />
                              <span>{event.location}</span>
                            </div>
                          ) : (
                            <span className="no-location">-</span>
                          )}
                        </td>
                        <td className="action-cell">
                          <button className="show-details-btn" onClick={() => handleShowDetails(event)}>
                            View
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="table-footer">
              <button className="close-table-btn" onClick={closeEventsTable}>
                Close Table
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <p>Calendar App {new Date().getFullYear()}</p>
      </footer>

      {modalReady && (
        <Modal
          isOpen={showAddModal}
          onRequestClose={() => {
            setShowAddModal(false)
            setErrors({})
          }}
          className="modal compact-modal"
          overlayClassName="modal-overlay"
          ariaHideApp={false}
        >
          <div className="modal-card">
            <div className="modal-card-header">
              <h2>New Event</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowAddModal(false)
                  setErrors({})
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-card-body">
              <div className="form-field">
                <label>
                  Title <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="title"
                  value={newEvent.title}
                  onChange={handleNewEventChange}
                  placeholder="Event name"
                  className={errors.title ? "error" : ""}
                />
                {errors.title && <span className="field-error">{errors.title}</span>}
              </div>

              <div className="form-field">
                <label>
                  Date <span className="required">*</span>
                </label>
                <input
                  type="text"
                  name="date"
                  value={newEvent.date}
                  onChange={handleNewEventChange}
                  placeholder="DD/MM/YYYY"
                  className={errors.date ? "error" : ""}
                />
                {errors.date && <span className="field-error">{errors.date}</span>}
              </div>

              <div className="form-field">
                <label>Location</label>
                <input
                  type="text"
                  name="location"
                  value={newEvent.location}
                  onChange={handleNewEventChange}
                  placeholder="Add location"
                />
              </div>

              <div className="form-field">
                <label>Notes</label>
                <textarea
                  name="notes"
                  value={newEvent.notes}
                  onChange={handleNewEventChange}
                  placeholder="Add notes (max 23 words)"
                  rows={2}
                  className={errors.notes ? "error" : ""}
                />
                {errors.notes && <span className="field-error">{errors.notes}</span>}
                <span className="field-hint">{getWordCount(newEvent.notes)}/23 words</span>
              </div>
            </div>

            <div className="modal-card-footer">
              <button
                className="btn-cancel"
                onClick={() => {
                  setShowAddModal(false)
                  setErrors({})
                }}
              >
                Cancel
              </button>
              <button className="btn-save" onClick={handleAddEvent}>
                Save Event
              </button>
            </div>
          </div>
        </Modal>
      )}

      {modalReady && (
        <Modal
          isOpen={showDetailsModal}
          onRequestClose={() => {
            setShowDetailsModal(false)
            setIsEditing(false)
            setErrors({})
          }}
          className="modal compact-modal"
          overlayClassName="modal-overlay"
          ariaHideApp={false}
        >
          <div className="modal-card">
            <div className="modal-card-header">
              <h2>{isEditing ? "Edit Event" : "Event Details"}</h2>
              <button
                className="modal-close"
                onClick={() => {
                  setShowDetailsModal(false)
                  setIsEditing(false)
                  setErrors({})
                }}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-card-body">
              {isEditing ? (
                <>
                  <div className="form-field">
                    <label>
                      Title <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="title"
                      value={editingEvent?.title || ""}
                      onChange={handleEditEventChange}
                      className={errors.title ? "error" : ""}
                    />
                    {errors.title && <span className="field-error">{errors.title}</span>}
                  </div>

                  <div className="form-field">
                    <label>
                      Date <span className="required">*</span>
                    </label>
                    <input
                      type="text"
                      name="date"
                      value={editingEvent?.date || ""}
                      onChange={handleEditEventChange}
                      className={errors.date ? "error" : ""}
                    />
                    {errors.date && <span className="field-error">{errors.date}</span>}
                  </div>

                  <div className="form-field">
                    <label>Location</label>
                    <input
                      type="text"
                      name="location"
                      value={editingEvent?.location || ""}
                      onChange={handleEditEventChange}
                    />
                  </div>

                  <div className="form-field">
                    <label>Notes</label>
                    <textarea
                      name="notes"
                      value={editingEvent?.notes || ""}
                      onChange={handleEditEventChange}
                      rows={2}
                      className={errors.notes ? "error" : ""}
                    />
                    {errors.notes && <span className="field-error">{errors.notes}</span>}
                  </div>
                </>
              ) : (
                <div className="event-details-view">
                  <div className="detail-row">
                    <Calendar size={18} />
                    <div className="detail-content">
                      <span className="detail-label">Event</span>
                      <span className="detail-value">{selectedEvent?.title}</span>
                    </div>
                  </div>

                  <div className="detail-row">
                    <Calendar size={18} />
                    <div className="detail-content">
                      <span className="detail-label">Date</span>
                      <span className="detail-value">{formatDateForDisplay(selectedEvent?.date)}</span>
                    </div>
                  </div>

                  <div className="detail-row">
                    <MapPin size={18} />
                    <div className="detail-content">
                      <span className="detail-label">Location</span>
                      <span className="detail-value">{selectedEvent?.location || "Not specified"}</span>
                    </div>
                  </div>

                  <div className="detail-row">
                    <FileText size={18} />
                    <div className="detail-content">
                      <span className="detail-label">Notes</span>
                      <span className="detail-value notes">{selectedEvent?.notes || "No notes"}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-card-footer">
              {isEditing ? (
                <>
                  <button
                    className="btn-cancel"
                    onClick={() => {
                      setIsEditing(false)
                      setErrors({})
                      setEditingEvent({ ...selectedEvent })
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn-delete" onClick={() => confirmDelete(selectedEvent)}>
                    <Trash2 size={14} />
                    Delete
                  </button>
                  <button className="btn-save" onClick={handleUpdateEvent}>
                    <Save size={14} />
                    Save
                  </button>
                </>
              ) : (
                <>
                  <button className="btn-cancel" onClick={() => setShowDetailsModal(false)}>
                    Close
                  </button>
                  <button className="btn-edit" onClick={() => setIsEditing(true)}>
                    <Edit3 size={14} />
                    Edit
                  </button>
                </>
              )}
            </div>
          </div>
        </Modal>
      )}

      {modalReady && (
        <Modal
          isOpen={showDeleteModal}
          onRequestClose={() => setShowDeleteModal(false)}
          className="modal compact-modal"
          overlayClassName="modal-overlay"
          ariaHideApp={false}
        >
          <div className="modal-card delete-card">
            <div className="delete-content">
              <div className="delete-icon">
                <Trash2 size={24} />
              </div>
              <h3>Delete Event?</h3>
              <p>Are you sure you want to delete "{eventToDelete?.title}"?</p>
            </div>

            <div className="modal-card-footer">
              <button className="btn-cancel" onClick={() => setShowDeleteModal(false)}>
                Cancel
              </button>
              <button className="btn-delete" onClick={handleDeleteEvent}>
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default App
