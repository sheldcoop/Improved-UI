import pandas as pd
from services.data_fetcher import DataFetcher

if __name__ == '__main__':
    fetcher = DataFetcher()
    print('about to fetch…')
    df = fetcher.fetch_historical_data("ICICI", "5m", "2020-01-01", "2020-01-15")
    print('fetch call returned')
    print('returned', type(df), 'rows', None if df is None else len(df))
    if df is not None:
        print(df.head())
        print(df.tail())
