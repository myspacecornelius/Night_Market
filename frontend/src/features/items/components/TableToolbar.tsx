import React, { useDeferredValue, useState } from 'react';

interface TableToolbarProps {
    onFilterChange: (filter: string) => void;
    onDensityChange: (density: 'comfortable' | 'compact') => void;
}

const TableToolbar: React.FC<TableToolbarProps> = ({ onFilterChange, onDensityChange }) => {
    const [filter, setFilter] = useState<string>('');
    const deferredFilter = useDeferredValue(filter);

    const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFilter(e.target.value);
    };

    React.useEffect(() => {
        onFilterChange(deferredFilter);
    }, [deferredFilter, onFilterChange]);

    return (
        <div className="flex justify-between items-center p-4">
            <input
                type="text"
                placeholder="Search..."
                value={filter}
                onChange={handleFilterChange}
                className="border rounded p-2"
            />
            <div>
                <button onClick={() => onDensityChange('comfortable')} className="mr-2">
                    Comfortable
                </button>
                <button onClick={() => onDensityChange('compact')}>
                    Compact
                </button>
            </div>
        </div>
    );
};

export default TableToolbar;
