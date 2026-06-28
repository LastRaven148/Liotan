Liotan time footer fix v3

Changed:
- Text messages now get class text-message.
- For plain text bubbles, time/footer is positioned inside message-content at right bottom.
- Text content reserves right padding so time/checkmarks do not overlap the last line.
- File/audio compact footer is shifted 2px lower and aligned to the bottom of its meta row.

Files changed:
- client/src/components/chat/Message.jsx
- client/src/styles/messages.css
