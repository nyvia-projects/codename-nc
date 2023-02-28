// import * as net from 'net';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Enter your name: ', (answer) => {
  console.log(`Hello, ${answer}!`);
  rl.close();
});

(name = 'ann') => {
  if (name) {
    console.log(name);
  }
};
