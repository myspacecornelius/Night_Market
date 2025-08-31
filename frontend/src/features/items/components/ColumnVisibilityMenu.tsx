import React from 'react';

interface ColumnVisibilityMenuProps {
    columns: { id: string; isVisible: boolean; label: string }[];
    onToggleColumn: (columnId: string) => void;
}

const ColumnVisibilityMenu: React.FC<ColumnVisibilityMenuProps> = ({ columns, onToggleColumn }) => {
    return (
        <div className="flex flex-col">
            {columns.map((column) => (
                <label key={column.id} className="flex items-center">
                    <input
                        type="checkbox"
                        checked={column.isVisible}
                        onChange={() => onToggleColumn(column.id)}
                        className="mr-2"
                    />
                    {column.label}
                </label>
            ))}
        </div>
    );
};

export default ColumnVisibilityMenu;
