import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ThriftRoutes from '../pages/ThriftRoutes';

describe('ThriftRoutes', () => {
  it('renders thrift routes', () => {
    render(<ThriftRoutes />);
    const headline = screen.getByText(/Thrift Routes/i);
    expect(headline).toBeInTheDocument();
  });
});
