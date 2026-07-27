import Alert from '@mui/material/Alert';
import { useEffect, useState } from 'react';

type MessageProps = {
    message: MessageData;
    autoHideDuration?: number;
};

const DEFAULT_AUTO_HIDE_DURATION = 3000;

export default function Message({
    message,
    autoHideDuration = DEFAULT_AUTO_HIDE_DURATION,
}: MessageProps) {
    const [isVisible, setIsVisible] = useState(Boolean(message));
    
    useEffect(() => {
        setIsVisible(Boolean(message));
    }, [message]);

    useEffect(() => {
        if (!isVisible || !message || message.type === 'error') {
            return;
        }

        const timeoutId = window.setTimeout(() => {
            setIsVisible(false);
        }, autoHideDuration);

        return () => window.clearTimeout(timeoutId);
    }, [autoHideDuration, isVisible, message]);
    if (!isVisible || !message) {
        return null;
    }

    return (
        <Alert
            severity={message.type}
            variant="filled"
            onClose={() => setIsVisible(false)}
            sx={{
                width: '100%',
                borderRadius: 0,
            }}
            style={{ opacity: 0.9}}
        >
            {message.message}
        </Alert>
    );
}