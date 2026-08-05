package typ

// ErrorResponse is the standard shape returned by this API.
type ErrorResponse struct {
	Error string `json:"error"`
	// Message is an optional human-readable string safe to show directly in
	// the UI (e.g. the room-limit message) — Error stays a stable machine code.
	Message string `json:"message,omitempty"`
}
