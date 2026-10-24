set -eu
BUILD=/opt/reizo-build-banana-20260919
STAGE=/opt/reizo-pricing-stage-20260919
BACK=/opt/reizo-before-pricing-20260919
[ "$(cat "$BUILD/pricing-release.exit")" = 0 ]
[ ! -e "$STAGE" ] && [ ! -e "$BACK" ]
mkdir "$STAGE"
tar -xzf "$BUILD/reizo-deploy.tar.gz" -C "$STAGE"
sudo -n cp -a /opt/reizo/.env "$STAGE/.env"
sudo -n cp -a /opt/reizo/data "$STAGE/"
sudo -n cp -a /opt/reizo/backups "$STAGE/"
sudo -n bash -c 'set -a; . /opt/reizo/.env; [ ! -f /etc/reizo/web.env ] || . /etc/reizo/web.env; set +a; cd /opt/reizo-pricing-stage-20260919; node scripts/db-migrate.mjs'
sudo -n systemctl stop reizo
sudo -n cp -a /opt/reizo/data/. "$STAGE/data/"
sudo -n mv /opt/reizo "$BACK"
sudo -n mv "$STAGE" /opt/reizo
sudo -n systemctl start reizo
printf 'backup=%s\n' "$BACK"
