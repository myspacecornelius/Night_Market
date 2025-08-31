import React from 'react';

interface ErrorBannerProps {
    message: string;
    onRetry: () => void;
}

const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onRetry }) => {
    return (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline">{message}</span>
            <button
                onClick={onRetry}
                className="absolute top-0 bottom-0 right-0 px-4 py-1 text-red-700 hover:text-red-900"
            >
                Retry
            </button>
        </div>
    );
};

export default ErrorBanner;
