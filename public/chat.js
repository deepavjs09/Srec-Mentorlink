const socket = io();
const email = prompt("Enter your email to join chat");
socket.emit('join', email);

function sendMessage(toEmail, message){
  socket.emit('message', {toEmail, message});
}

socket.on('message', msg => {
  console.log('New message:', msg);
});
