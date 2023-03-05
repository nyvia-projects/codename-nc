import * as os from 'os';
import * as net from 'net';
import * as readLine from 'readline';
import { clear } from 'console';

class ProgramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProgramError';
  }
}

class IPError extends ProgramError {
  constructor(message: string) {
    super(message);
    this.name = 'IPError';
  }
}

class InvalidPortError extends ProgramError {
  constructor(message: string) {
    const defaultMessage = 'Invalid port number';
    super(message ? defaultMessage + ':\n\t ' + message : defaultMessage);
    this.name = 'PortError';
  }
}

class InvalidArgumentsError extends ProgramError {
  constructor(message?: string) {
    const defaultMessage = 'Invalid argument(s)';
    super(message ? defaultMessage + ':\n\t ' + message : defaultMessage);
    this.name = 'InvalidArgumentsError';
  }
}

class ConnectionError extends ProgramError {
  constructor(message: string) {
    super(message);
    this.name = 'ConnectionError';
  }
}
try {
  // get args
  const args = process.argv.slice(2);

  // single arg
  if (args.length !== 1) {
    throw new InvalidArgumentsError(
      'Please provide one argument as the port number!'
    );
  }

  interface IPort {
    value: number;
    isValid(): boolean;
    toString(): string;
  }

  class Port implements IPort {
    constructor(public value: number) {}

    isValid(): boolean {
      if (
        !Number.isInteger(this.value) ||
        this.value <= 1024 ||
        this.value >= 65535
      ) {
        throw new InvalidArgumentsError('Port should be within [1024, 65535]');
      } else return true;
    }
    toString(): string {
      return String(this.value);
    }
  }

  type IPv4 = string & { __ipv4Brand: true };

  // predicate on IPv4
  const isIPv4 = (ip: string): ip is IPv4 => {
    const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
    return ipv4Regex.test(ip);
  };

  // to IP type converter
  const createIPv4 = (ip: string): IPv4 => {
    if (!isIPv4(ip)) {
      throw new IPError(`"${ip}" is not a valid IPv4 address!`);
    }
    return ip;
  };

  // get IP
  const getIPAddress = (): IPv4 => {
    const networkInterfaces = os.networkInterfaces();

    const results: IPv4[] = [];

    Object.keys(networkInterfaces).forEach((name) => {
      networkInterfaces[name]?.forEach((net) => {
        if (!net.family || net.family !== 'IPv4' || net.internal) {
          return;
        }

        const ipAddress: IPv4 = createIPv4(net.address);
        results.push(ipAddress);
      });
    });

    if (results.length === 0) {
      throw new IPError('Unable to determine IPv4 address!');
    } else {
      return results[0];
    }
  };

  class Server {
    private static instance: Server;

    private readonly _ip: IPv4;
    private readonly _port: number;

    // connections to this server
    private tcpClients: net.Socket[] = [];
    private tcpServer: net.Server;

    private constructor(port: IPort) {
      this._ip = getIPAddress();
      this._port = port.value;

      this.tcpServer = net.createServer((socket): void => {
        this.tcpClients.push(socket);
        const remoteIP = socket.remoteAddress?.replace(/^.*:/, '');
        console.log(`New Client connected:  ${remoteIP as unknown as string}`);
        socket.write('Welcome------');

        socket.on('data', (data) => {
          console.log(`Message received from:\t ${remoteIP as string}`);
          console.log(`Sender port:\t\t ${socket.remotePort ?? 'unknown'}`);
          console.log(`Message:\t\t ${data.toString()}`);
        });

        socket.on('error', (error) => {
          console.log('A client has disconnected!');
        });

        // Ctrl + C
        socket.on('close', () => {
          console.log('A client terminated connection!');
        });
      });

      this.tcpServer.listen(this._port);
    }

    public static getInstance(portNumber: string): Server {
      const portInt = parseInt(portNumber, 10);

      if (isNaN(portInt) || !Number.isInteger(portInt)) {
        throw new InvalidPortError(
          'Please provide a valid integer port number!'
        );
      }

      const port = new Port(portInt);

      if (!port.isValid()) {
        throw new InvalidPortError(
          'Please provide a valid port number between 1024 and 65535!'
        );
      }
      if (!Server.instance) {
        Server.instance = new Server(port);
      }
      return Server.instance;
    }

    get port(): number {
      return this._port;
    }

    get ip(): string {
      return this._ip;
    }

    public info(): void {
      console.log(`IP: ${this._ip}, Port: ${this._port}`);
    }
  }

  type Connection = {
    id: number;
    remoteIP: IPv4;
    remotePort: Port;
    socket: net.Socket;
  };

  class ConnectionsManager {
    private static instance: ConnectionsManager;

    private connections: Connection[] = [];
    private _nextId;

    private constructor() {
      this._nextId = 1;
    }

    static getInstance(): ConnectionsManager {
      if (!ConnectionsManager.instance) {
        ConnectionsManager.instance = new ConnectionsManager();
      }
      return ConnectionsManager.instance;
    }

    // connects socket to remote server
    private connectSocket(connection: Connection): void {
      const { remoteIP, remotePort, socket } = connection;

      if (!socket.connecting && !socket.destroyed) {
        socket.connect({ host: remoteIP, port: remotePort.value });
      }
    }

    addConnection(remoteIP: IPv4, remotePort: Port): void {
      // input validation
      if (!remotePort.isValid() || !remoteIP || !remotePort) {
        throw new InvalidArgumentsError();
      }

      // new socket
      const socket = new net.Socket();

      // new connection
      const connection: Connection = {
        id: this._nextId,
        remoteIP,
        remotePort,
        socket,
      };

      socket.on('connect', () => {
        this.updateConnectionIds();
        socket.write(` joined`);
      });

      socket.on('error', () => {
        console.log('server is offline..');
      });

      // add to connections
      this.connections.push(connection);
      console.log('Connection added!');

      // connect the new socket
      this.connectSocket(connection);

      // next id
      this._nextId++;
    }

    removeConnection(id: number): void {
      const index = this.connections.findIndex(
        (connection) => connection.id === id
      );

      if (index === -1) {
        throw new ConnectionError(`Connection with id ${id} not found!`);
      }

      this.connections[index].socket.destroy();
      this.connections.splice(index, 1);
      this.updateConnectionIds();
    }

    private updateConnectionIds(): void {
      this.connections.forEach((connection, index) => {
        connection.id = index + 1;
      });
      this._nextId = this.connections.length + 1;
    }

    listConnections(): string {
      let result = '';
      result += 'id\tIP Address\tPort\n';
      result += this.connections
        .map(
          (connection) =>
            `${connection.id}\t${connection.remoteIP}\t${connection.remotePort.value}`
        )
        .join('\n');
      return result;
    }

    sendMessage(connectionId: number, message: string): void {
      const connection = this.connections.find(
        (conn) => conn.id === connectionId
      );

      if (!connection) {
        throw new ConnectionError(
          `Connection with id ${connectionId} not found!`
        );
      }

      connection.socket.write(message);
    }
  }

  interface ICommand {
    name:
      | 'help'
      | 'myip'
      | 'myport'
      | 'connect'
      | 'list'
      | 'terminate'
      | 'send'
      | 'exit';

    execute(args: string[]): void;
  }

  class HelpCommand implements ICommand {
    name = 'help' as const;
    execute(args: string[]): void {
      if (args.length > 0) {
        throw new InvalidArgumentsError(
          'This command does not accept arguments'
        );
      }
      console.log('Available commands:');
      console.log('help \t\t\t Prints help message');
      console.log('myip \t\t\t Prints local IP');
      console.log('myport \t\t\t Prints listening port');
      console.log('connect <ip> <port> \t Connects to server in network');
      console.log('list \t\t\t Lists connections');
      console.log('terminate <id> \t\t Terminates a connection');
      console.log('send <id> <message> \t Sends message to server');
      console.log('exit \t\t\t Terminates connections and exits');
    }
  }

  class MyIPCommand implements ICommand {
    name = 'myip' as const;
    private readonly server: Server;

    constructor(server: Server) {
      this.server = server;
    }
    execute(args: string[]): void {
      if (args.length > 0) {
        throw new InvalidArgumentsError(
          'This command does not accept arguments!'
        );
      }
      console.log(`IP Address: ${this.server.ip}`);
    }
  }

  class MyPortCommand implements ICommand {
    name = 'myport' as const;
    private readonly server: Server;

    constructor(server: Server) {
      this.server = server;
    }
    execute(args: string[]): void {
      if (args.length > 0) {
        throw new InvalidArgumentsError(
          'This command does not accept arguments!'
        );
      }
      console.log(`Port: ${this.server.port}`);
    }
  }

  class ConnectCommand implements ICommand {
    name = 'connect' as const;

    constructor(private readonly manager: ConnectionsManager) {}
    execute(args: string[]): void {
      if (args.length !== 2) {
        throw new InvalidArgumentsError(
          'Expected 2 arguments: destination and port!'
        );
      }

      const remoteIP: IPv4 = createIPv4(args[0]);
      const remotePort = new Port(parseInt(args[1], 10));

      remotePort.isValid();

      this.manager.addConnection(remoteIP, remotePort);
    }
  }

  class ListCommand implements ICommand {
    name = 'list' as const;

    constructor(private readonly manager: ConnectionsManager) {}
    execute(args: string[]): void {
      if (args.length > 0) {
        throw new InvalidArgumentsError(
          'This command does not accept arguments!'
        );
      }
      console.log(this.manager.listConnections());
    }
  }

  class TerminateCommand implements ICommand {
    name = 'terminate' as const;
    constructor(private readonly manager: ConnectionsManager) {}
    execute(args: string[]): void {
      if (args.length < 1) {
        throw new InvalidArgumentsError(
          'Expected a single argument: connectionId!'
        );
      }
      const connectionId: number = parseInt(args[0], 10);
      if (isNaN(connectionId)) {
        throw new InvalidArgumentsError('ConnectionId must be a number!');
      }
      this.manager.removeConnection(connectionId);
    }
  }

  class SendCommand implements ICommand {
    name = 'send' as const;
    constructor(private readonly manager: ConnectionsManager) {}
    execute(args: string[]): void {
      if (args.length < 2) {
        throw new InvalidArgumentsError(
          'Expected at least 2 arguments: connection id and message!'
        );
      }

      const connectionId: number = parseInt(args[0], 10);
      if (isNaN(connectionId)) {
        throw new InvalidArgumentsError('ConnectionId must be a number!');
      }

      const message: string = args.slice(1).join(' ');
      if (!message) {
        throw new InvalidArgumentsError('Message cannot be empty!');
      }
      this.manager.sendMessage(connectionId, message);
    }
  }
  class ExitCommand implements ICommand {
    name = 'exit' as const;
    execute(): void {
      console.log('Exitting');
      process.exit(0);
    }
  }
  const cli = readLine.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const commands: ICommand[] = [
    new HelpCommand(),
    new MyIPCommand(Server.getInstance(args[0])),
    new MyPortCommand(Server.getInstance(args[0])),
    new ConnectCommand(ConnectionsManager.getInstance()),
    new ListCommand(ConnectionsManager.getInstance()),
    new TerminateCommand(ConnectionsManager.getInstance()),
    new SendCommand(ConnectionsManager.getInstance()),
    new ExitCommand(),
  ];

  clear();
  cli.setPrompt('~> ');
  cli.prompt();

  cli.on('line', (input) => {
    const inputArgs = input.trim().split(' ');
    const command = commands.find((cmd) => cmd.name === inputArgs[0]);
    if (command) {
      try {
        const commandArgs = inputArgs.slice(1);
        command.execute(commandArgs);
      } catch (error) {
        if (error instanceof InvalidArgumentsError)
          console.error(error.message);
        else console.error(String(error));
      }
    } else if (input === '') {
      cli.prompt();
    } else {
      console.log("Unkown command:\n\t Type 'help' for available commands!");
    }
    cli.prompt();
  });

  cli.on('close', () => {
    console.log('\nExiting CLI');
    process.exit(0);
  });
} catch (error) {
  if (error instanceof ProgramError) {
    console.error(error.message);
  } else {
    console.error('An unknown error occurred.!');
  }
  process.exit(1);
}

/*
await setIPForClient.then((name: unknown) => {
  const ip = name as string;

  const socket = net.connect({
    port: 8090,
  });

  socket.on('connect', () => {
    socket.write(`${ip} joined`);
  });

  reader.on('line', (data) => {
    if (data === 'exit') {
      socket.write(`${ip} left`);
      socket.setTimeout(1000);
    } else {
      socket.write(`${ip}: ${data}`);
    }
  });

  socket.on('data', (data) => {
    console.log('\x1b[33m%s\x1b[0m', data);
  });

  socket.on('timeout', () => {
    socket.write('exit');
    socket.end();
  });

  socket.on('end', () => {
    process.exit();
  });

  socket.on('error', () => {
    console.log('server is offline..');
  });
});
*/
