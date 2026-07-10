package services

import "crypto/rand"

// joinCodeAlphabet excludes visually ambiguous characters (0/O, 1/I).
const joinCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

// GenerateJoinCode returns a 6-character uppercase alphanumeric code for
// players to self-join a game lobby.
func GenerateJoinCode() (string, error) {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	code := make([]byte, 6)
	for i, v := range b {
		code[i] = joinCodeAlphabet[int(v)%len(joinCodeAlphabet)]
	}
	return string(code), nil
}
