import { screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ThriftRoutes from '../pages/ThriftRoutes';
import { renderWithProviders } from './test-utils';

describe('ThriftRoutes', () => {
  it('renders thrift routes', () => {
    renderWithProviders(<ThriftRoutes />);
    const headline = screen.getByText(/Thrift Routes/i);
    expect(headline).toBeInTheDocument();
  });
});
