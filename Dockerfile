FROM ubuntu:14.04

RUN apt-get update -y

# install system deps
RUN apt-get install -y git curl w3m

# install node
RUN curl -sL https://deb.nodesource.com/setup_4.x | sudo -E bash -
RUN apt-get install -y nodejs

# install rss monitor and edgar watcher
RUN git clone https://github.com/buzzfeed-openlab/puppy.git /opt/puppy
COPY . /opt/edgar-watcher

# install deps
RUN cd /opt/edgar-watcher; npm install
RUN cd /opt/puppy; npm install

# run
CMD ["node", "/opt/puppy/run.js", "/opt/edgar-watcher/config.json"]
