import React from 'react';

interface DensityToggleProps {
    currentDensity: 'comfortable' | 'compact';
    onDensityChange: (density: 'comfortable' | 'compact') => void;
}

const DensityToggle: React.FC<DensityToggleProps> = ({ currentDensity, onDensityChange }) => {
    return (
        <div className="flex items-center">
            <span className="mr-2">Density:</span>
            <button
                onClick={() => onDensityChange('comfortable')}
                className={`px-2 py-1 rounded ${currentDensity === 'comfortable' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
                Comfortable
            </button>
            <button
                onClick={() => onDensityChange('compact')}
                className={`ml-2 px-2 py-1 rounded ${currentDensity === 'compact' ? 'bg-blue-500 text-white' : 'bg-gray-200'}`}
            >
                Compact
            </button>
        </div>
    );
};

export default DensityToggle;
