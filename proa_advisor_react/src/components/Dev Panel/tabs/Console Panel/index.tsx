import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import './styles.css';

export default function ConsoleTab() {
    // Uses xterm for terminal emulation and react-xterm for React integration.
    const terminalRef = useRef(null);

    useEffect(() => {
        const term = new Terminal({
            cursorBlink: true,
            rows: 20,
            cols: 80,
            theme: {
                background: "#1e1e1e",
            },
        });

        const fitAddon = new FitAddon();

        term.loadAddon(fitAddon);

        terminalRef.current && term.open(terminalRef.current);

        fitAddon.fit();
        const token = localStorage.getItem("token");
        const socket = new WebSocket("ws://localhost:3001?token=" + token);

        socket.onopen = () => {
            term.writeln("Connected");
        };

        socket.onmessage = (event) => {
            term.write(event.data);
        };

        term.onData((data: string) => {
            socket.send(data);
        });

        socket.onclose = () => {
            term.writeln("\r\nConnection closed\n");
        };

        window.addEventListener("resize", () => {
            fitAddon.fit();
        });

        return () => {
            socket.close();
            term.dispose();
        };
    }, []);

    return (
        <div
            ref={terminalRef}
            style={{
                width: "100%",
                height: "70vh",
                textAlign: "left",
            }}
        />
    );
}