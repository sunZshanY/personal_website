"""
KnowFlow API Server — Flask 入口
================================
启动:
    python main.py              # 开发模式 (debug)
    python main.py --prod       # 生产模式 (waitress)
"""
import sys, os

if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from app import create_app

if __name__ == '__main__':
    app = create_app()
    host = app.config['HOST']
    port = app.config['PORT']

    print('=' * 50)
    print('  📚 KnowFlow API Server')
    print(f'  Address: http://{host}:{port}')
    print(f'  Health:  http://{host}:{port}/api/health')
    print(f'  Notes:   http://{host}:{port}/api/notes')
    print('=' * 50)

    if '--prod' in sys.argv:
        from waitress import serve
        print('  Mode: production (waitress)')
        print('=' * 50)
        serve(app, host=host, port=port)
    else:
        print('  Mode: development (Flask)')
        print('=' * 50)
        app.run(debug=True, host=host, port=port)
