import { cleanup, render, screen } from '@testing-library/react';

describe('cms', () => {
  it('should render the icon without errors', async () => {
    render(<cms data-testid="icon" />);

    const svgElement = screen.getByTestId('icon');

    expect(svgElement).toBeInTheDocument();

    cleanup();
  });
});
