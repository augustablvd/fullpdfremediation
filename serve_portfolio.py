from flask import Flask, render_template, jsonify, request
import requests as http_client

app = Flask(__name__, template_folder='templates', static_folder='static')

@app.route('/')
@app.route('/portfolio')
def portfolio():
    return render_template('portfolio.html')

@app.route('/api/visitor')
def visitor_info():
    forwarded = request.headers.get('X-Forwarded-For')
    real_ip   = request.headers.get('X-Real-IP')
    if forwarded:
        ip = forwarded.split(',')[0].strip()
    elif real_ip:
        ip = real_ip.strip()
    else:
        ip = request.remote_addr or ''
    if ip.startswith('::ffff:'):
        ip = ip[7:]
    try:
        resp = http_client.get(
            f'http://ip-api.com/json/{ip}',
            params={'fields': 'status,country,regionName,city,org,as,isp,query'},
            timeout=5
        )
        return jsonify(resp.json())
    except Exception as e:
        return jsonify({'status': 'fail', 'query': ip})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
