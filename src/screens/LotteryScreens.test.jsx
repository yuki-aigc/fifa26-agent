import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { OddsCell } from './LotteryScreens.jsx';

describe('OddsCell', () => {
  it('renders rising odds with an up marker', () => {
    render(<OddsCell label="主胜" value={1.82} flag={1} />);

    expect(screen.getByText('主胜')).toBeInTheDocument();
    expect(screen.getByText('1.82')).toBeInTheDocument();
    expect(screen.getByText('↑')).toBeInTheDocument();
  });

  it('renders falling odds with a down marker', () => {
    render(<OddsCell label="客胜" value={3.2} flag={-1} />);

    expect(screen.getByText('客胜')).toBeInTheDocument();
    expect(screen.getByText('↓')).toBeInTheDocument();
  });
});
